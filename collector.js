#!/usr/bin/env node

const net = require("net");
const fs = require("fs");
const axios = require("axios");
const os = require("os");
const path = require("path");
const { Pool } = require("pg");
const Database = require("better-sqlite3");

/* --- helper: lokalni ISO z offsetom, npr. 2025-10-19T20:41:25+02:00 --- */
function toLocalISOString(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const hh = pad(Math.trunc(Math.abs(tz) / 60));
  const mm = pad(Math.abs(tz) % 60);
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
    sign + hh + ":" + mm
  );
}

class TeleTrackCollector {
  constructor(configPath = "./config.json") {
    this.configPath = configPath;
    this.config = this.loadConfig();

    this.socket = null;
    this.connected = false;
    this.buffer = "";

    this.callQueue = [];
    // lid -> { endpoints:Set, best, lastAt, flushed, origin, target, firstTsUTC, firstTsLocal }
    this.callsByLinkedId = new Map();

    this.heartbeatTimer = null;
    this.batchTimer = null;
    this.flushTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;

    // Database connection
    this.db = null;
    this.dbPool = null;

    // Initialize logging
    this.logFile = null;
    this.logStream = null;
    this.initLogging();

    this.handleData = this.handleData.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  // ========== CONFIG ==========
  loadConfig() {
    try {
      const p = this.configPath;
      if (!fs.existsSync(p)) {
        console.error(`Config file not found: ${p}`);
        process.exit(1);
      }
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!cfg.organization?.apiKey) throw new Error("Missing organization.apiKey");
      if (!cfg.ami?.host || !cfg.ami?.username || !cfg.ami?.password)
        throw new Error("Missing AMI connection details");
      cfg.collector = cfg.collector || {};
      cfg.collector.batchSize = cfg.collector.batchSize ?? 10;
      cfg.collector.batchTimeout = cfg.collector.batchTimeout ?? 5000;
      cfg.collector.heartbeatInterval = cfg.collector.heartbeatInterval ?? 60000;
      cfg.collector.staleMs = cfg.collector.staleMs ?? 5000; // hitrejši flush v dev/test
      cfg.logging = cfg.logging || { level: "debug" };
      return cfg;
    } catch (e) {
      console.error(`Failed to load config: ${e.message}`);
      process.exit(1);
    }
  }

  // ========== LOGGING ==========
  initLogging() {
    const logConfig = this.config.logging || {};
    this.logFile = logConfig.file || "collector.log";
    this.maxLogSize = this.parseLogSize(logConfig.maxSize || "10MB");
    this.maxLogFiles = logConfig.maxFiles || 5;
    
    // Ensure log directory exists
    const logDir = path.dirname(this.logFile);
    if (logDir && !fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.openLogStream();
  }

  parseLogSize(sizeStr) {
    const match = sizeStr.match(/^(\d+)(MB|KB|GB)?$/i);
    if (!match) return 10 * 1024 * 1024; // Default 10MB
    
    const size = parseInt(match[1]);
    const unit = (match[2] || 'MB').toUpperCase();
    
    switch (unit) {
      case 'KB': return size * 1024;
      case 'MB': return size * 1024 * 1024;
      case 'GB': return size * 1024 * 1024 * 1024;
      default: return size * 1024 * 1024;
    }
  }

  openLogStream() {
    if (this.logStream) {
      this.logStream.end();
    }
    
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.logStream.on('error', (err) => {
      console.error('Log stream error:', err);
    });
  }

  rotateLogIfNeeded() {
    if (!fs.existsSync(this.logFile)) return;
    
    const stats = fs.statSync(this.logFile);
    if (stats.size >= this.maxLogSize) {
      this.logStream.end();
      
      // Simply truncate the log file instead of rotating
      fs.writeFileSync(this.logFile, '');
      
      // Open new stream
      this.openLogStream();
      
      this.log("info", "Log file truncated due to size limit");
    }
  }

  log(level, message) {
    const ts = new Date().toISOString();
    const levels = ["error", "warn", "info", "debug"];
    const current = this.config?.logging?.level || "info";
    if (levels.indexOf(level) > levels.indexOf(current)) return;
    
    const logMessage = `[${ts}] [${level.toUpperCase()}] ${message}\n`;
    
    // Write to file if stream is available
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.write(logMessage);
      this.rotateLogIfNeeded();
    } else {
      // Fallback to console if file logging fails
      console.log(logMessage.trim());
    }
  }

  // ========== DATABASE ==========
  async initDatabase() {
    const dbConfig = this.config.database;
    if (!dbConfig) {
      this.log("warn", "No database configuration found, skipping database connection");
      return;
    }

    try {
      if (dbConfig.type === "postgresql") {
        this.dbPool = new Pool({
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.username,
          password: dbConfig.password,
          ssl: dbConfig.ssl,
          connectionTimeoutMillis: dbConfig.connectTimeout * 1000 || 10000,
          max: dbConfig.pool?.max || 10,
          min: dbConfig.pool?.min || 2,
        });

        // Test connection
        const client = await this.dbPool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        this.log("info", `✅ Connected to PostgreSQL database: ${dbConfig.database}`);
      } else if (dbConfig.type === "sqlite") {
        this.db = new Database(dbConfig.path);
        this.log("info", `✅ Connected to SQLite database: ${dbConfig.path}`);
      }
    } catch (error) {
      this.log("error", `Database connection failed: ${error.message}`);
      // Don't exit, continue without database
    }
  }

  async saveCallToDatabase(callData) {
    if (!this.dbPool && !this.db) return;

    try {
      if (this.dbPool) {
        // PostgreSQL
        await this.saveCallToPostgreSQL(callData);
      } else if (this.db) {
        // SQLite
        this.saveCallToSQLite(callData);
      }
    } catch (error) {
      this.log("error", `Failed to save call to database: ${error.message}`);
    }
  }

  async saveCallToPostgreSQL(callData) {
    const query = `
      INSERT INTO CallHistory (
        unique_id, organization_id, collector_id, timestamp, status, source, destination,
        caller_name, direction, call_type, source_raw, dest_raw, duration, billable_seconds,
        disposition, last_app, context, destination_context, last_data, phone_number, raw_event
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    `;

    const values = [
      callData.uniqueId,
      this.config.organization.id,
      null, // collector_id - could be added later
      callData.timestamp,
      callData.status,
      callData.source,
      callData.destination,
      callData.callerName,
      callData.direction,
      callData.callType,
      callData.source_raw,
      callData.dest_raw,
      callData.duration || 0,
      callData.billableSeconds || 0,
      callData.disposition,
      callData.lastApp,
      callData.context,
      callData.destinationContext,
      callData.lastData,
      callData.phoneNumber,
      JSON.stringify(callData.rawEvent)
    ];

    await this.dbPool.query(query, values);
    this.log("debug", `💾 DB: ${callData.uniqueId}`);
  }

  saveCallToSQLite(callData) {
    const stmt = this.db.prepare(`
      INSERT INTO CallHistory (
        uniqueId, organizationId, collectorId, timestamp, status, source, destination,
        callerName, direction, callType, sourceRaw, destRaw, duration, billableSeconds,
        disposition, lastApp, context, destinationContext, lastData, phoneNumber, rawEvent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      callData.uniqueId,
      this.config.organization.id,
      null, // collectorId
      callData.timestamp,
      callData.status,
      callData.source,
      callData.destination,
      callData.callerName,
      callData.direction,
      callData.callType,
      callData.source_raw,
      callData.dest_raw,
      callData.duration || 0,
      callData.billableSeconds || 0,
      callData.disposition,
      callData.lastApp,
      callData.context,
      callData.destinationContext,
      callData.lastData,
      callData.phoneNumber,
      JSON.stringify(callData.rawEvent)
    );
    
    this.log("debug", `💾 DB: ${callData.uniqueId}`);
  }

  // ========== STARTUP ==========
  async start() {
    await this.initDatabase();
    this.connectAMI();
    this.startHeartbeat();
    this.startStaleFlusher();

    process.on("SIGINT", () => this.shutdown("SIGINT"));
    process.on("SIGTERM", () => this.shutdown("SIGTERM"));
  }

  // ========== AMI CONNECTION ==========
  connectAMI() {
    this.log("info", `Connecting to AMI ${this.config.ami.host}:${this.config.ami.port}...`);
    this.socket = net.createConnection({
      host: this.config.ami.host,
      port: this.config.ami.port,
    });

    this.socket.on("connect", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.sendAMIAction("Login", {
        Username: this.config.ami.username,
        Secret: this.config.ami.password,
      });
      this.log("info", "✅ Connected to AMI");
    });

    this.socket.on("data", this.handleData);
    this.socket.on("close", this.handleClose);
    this.socket.on("error", this.handleError);
  }

  handleData(data) {
    this.buffer += data.toString();
    const parts = this.buffer.split("\r\n\r\n");
    this.buffer = parts.pop();
    for (const m of parts) if (m.trim()) this.processAMIMessage(m);
  }

  handleClose() {
    this.log("warn", "AMI connection closed");
    this.connected = false;
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        this.connectAMI();
      }, delay);
    } else {
      process.exit(1);
    }
  }

  handleError(e) {
    this.log("error", `AMI error: ${e.message}`);
  }

  sendAMIAction(action, params = {}) {
    if (!this.connected) return;
    let msg = `Action: ${action}\r\n`;
    for (const [k, v] of Object.entries(params)) msg += `${k}: ${v}\r\n`;
    msg += "\r\n";
    this.socket.write(msg);
    this.log("debug", `AMI: ${action}`);
  }

  // ========== MESSAGE PARSING ==========
  processAMIMessage(message) {
    const ev = {};
    message.split("\r\n").forEach((line) => {
      const i = line.indexOf(":");
      if (i > 0) ev[line.substring(0, i).trim()] = line.substring(i + 1).trim();
    });

    if (ev.Response === "Success" && ev.Message === "Authentication accepted") {
      this.log("info", "✅ AMI authentication successful");
      // Pravilna naročnina + fallback (nekateri sistemi upoštevajo samo enega)
      this.sendAMIAction("Events", { Events: "on" });     // moderno
      this.sendAMIAction("Events", { EventMask: "on" });  // fallback
      return;
    }

    if (ev.Event) this.handleAMIEvent(ev);
  }

  // ========== NORMALIZATION HELPERS ==========
  static cleanEndpoint(ch = "") {
    return String(ch)
      .split(";")[0]
      .replace(/-[0-9a-f]+$/i, "")
      .replace(/^(PJSIP|SIP|Local|IAX2|DAHDI)\//, "");
  }

  static firstFromLastData(ld = "") {
    return String(ld).split("&")[0].replace(/^(PJSIP|SIP|Local|IAX2|DAHDI)\//, "");
  }

  cleanPhoneNumber(v) {
    if (!v) return "";
    return String(v)
      .split(";")[0]
      .replace(/^(PJSIP\/|SIP\/|IAX2\/|DAHDI\/|Local\/)/, "")
      .replace(/-[0-9a-f]+$/i, "")
      .replace(/^s$/, "")
      .trim();
  }

  static resolvePartiesFromEvent(ev) {
    const rawSrc = ev.CallerIDNum || ev.CallerID || "";
    const rawDst = ev.Exten || ev.DestExten || ev.Destination || "";
    const ch = ev.Channel || "";
    const dstCh = ev.DestChannel || ev.DestinationChannel || "";
    const lastData = ev.LastData || "";

    const isNum = (x) => !!x && /^\d{2,6}$/.test(String(x));
    const caller = isNum(rawSrc) ? rawSrc : this.cleanEndpoint(ch);

    let callee = isNum(rawDst) ? rawDst : "";
    if (!callee || rawDst === "s") {
      const fromLD = this.firstFromLastData(lastData);
      const fromCh = this.cleanEndpoint(dstCh);
      callee = isNum(fromCh) ? fromCh : isNum(fromLD) ? fromLD : callee;
    }
    return { caller, callee };
  }

  static classifyDirection(caller, callee, ev) {
    const isInt = (x) => /^[1-8][0-9]{1,5}$/.test(x || "");
    if (isInt(caller) && isInt(callee)) return "internal";
    const trunkCtx =
      /from-trunk|ext-did/i.test(ev.Context || "") ||
      /from-trunk|ext-did/i.test(ev.DestinationContext || "");
    if (trunkCtx) return "inbound";
    const dstExternal = /^\+?\d{7,}$/.test(ev.Dst || ev.Exten || "");
    if (dstExternal) return "outbound";
    return "internal";
  }

  mapEventToStatus(e, ev) {
    // CDR: uporabi Disposition → lepa labels (answered/missed/busy/failed)
    if (e === "Cdr") {
      const dispositionMap = {
        "ANSWERED": "answered",
        "NO ANSWER": "missed",
        "BUSY": "busy",
        "FAILED": "failed",
        "CONGESTION": "failed",
      };
      return dispositionMap[ev.Disposition] || "unknown";
    }
    // Ostali event-i
    const statusMap = {
      Newchannel: "ringing",
      Dial: "ringing",
      Bridge: "answered", // zveza vzpostavljena
      DialEnd: "ended",
      Hangup: "ended",
      Cdr: "completed",
    };
    return statusMap[e] || "unknown";
  }

  // ========== MEMORY / INDEXING ==========
  upsertCallMemory(ev, originMaybe, targetMaybe) {
    const lid = ev.Linkedid || ev.LinkedID || ev.Uniqueid || ev.UniqueID;
    if (!lid) return;

    const isNum = (v) => !!v && /^\d{2,6}$/.test(String(v));
    const clean = TeleTrackCollector.cleanEndpoint;

    const mem = this.callsByLinkedId.get(lid) || {
      endpoints: new Set(),
      best: null,
      lastAt: Date.now(),
      flushed: false,
      firstTsUTC: undefined,
      firstTsLocal: undefined,
    };

    if (!mem.firstTsUTC)  mem.firstTsUTC  = Date.now();
    if (!mem.firstTsLocal) mem.firstTsLocal = toLocalISOString(new Date());

    if (isNum(originMaybe) && !mem.origin) mem.origin = String(originMaybe);
    if (isNum(targetMaybe) && !mem.target) mem.target = String(targetMaybe);

    [
      clean(ev.Channel),
      clean(ev.DestChannel || ev.DestinationChannel || ev.BridgedChannel || ev.Channel2),
      clean(ev.ConnectedLineNum),
      clean(ev.CallerIDNum),
      TeleTrackCollector.firstFromLastData(ev.LastData || ""),
    ]
      .map((x) => clean(x))
      .filter((x) => isNum(x))
      .forEach((x) => mem.endpoints.add(x));

    if (!mem.target && isNum(mem.origin)) {
      for (const ep of mem.endpoints) {
        if (ep !== mem.origin) { mem.target = ep; break; }
      }
    }

    mem.lastAt = Date.now();
    this.callsByLinkedId.set(lid, mem);
  }

  recallCallMemory(ev) {
    const lid = ev.Linkedid || ev.LinkedID || ev.Uniqueid || ev.UniqueID;
    if (!lid) return {};
    return this.callsByLinkedId.get(lid) || {};
  }

  // ========== EVENT HANDLER ==========
  handleAMIEvent(ev) {
    // Only process call-related events
    const callEvents = ['Newchannel', 'Hangup', 'Bridge', 'Dial', 'DialEnd', 'Cdr'];
    if (!callEvents.includes(ev.Event)) {
      // Just log a simple skip message, no duplicate events
      if (!this.lastSkippedEvent || this.lastSkippedEvent !== ev.Event) {
        this.log("debug", `Skip: ${ev.Event}`);
        this.lastSkippedEvent = ev.Event;
      }
      return;
    }
    
    // Log actual call events with details
    this.log("debug", `📞 Call Event: ${ev.Event} - ${ev.CallerIDNum || 'unknown'} → ${ev.Exten || ev.DestExten || 'unknown'}`);
    
    const clean = TeleTrackCollector.cleanEndpoint;

    // Feed memory by event type
    if (ev.Event === "Dial") {
      const origin = ev.CallerIDNum || clean(ev.Channel);
      const target =
        TeleTrackCollector.firstFromLastData(ev.LastData || "") ||
        clean(ev.DestChannel || ev.DestinationChannel);
      this.upsertCallMemory(ev, origin, target);
    } else if (ev.Event === "Bridge") {
      const a = clean(ev.Channel1 || ev.Channel);
      const b = clean(ev.Channel2 || ev.BridgedChannel || ev.DestChannel);
      this.upsertCallMemory(ev, a, b);
      this.upsertCallMemory(ev, b, a);
      // Bridge ⇒ odgovorjeno (če kasneje pride CDR, ga prepiše)
      const lid = ev.Linkedid || ev.LinkedID || ev.Uniqueid || ev.UniqueID;
      const mem = lid ? this.callsByLinkedId.get(lid) : null;
      if (mem && mem.best) mem.best.status = "completed";
    } else if (ev.Event === "Cdr") {
      this.upsertCallMemory(ev, ev.Source || ev.CallerIDNum, ev.Destination || ev.Dst);
    } else if (ev.Event === "Newchannel") {
      this.upsertCallMemory(ev, ev.CallerIDNum || clean(ev.Channel), undefined);
    }

    // Current snapshot
    const callData = this.parseCallEvent(ev);
    if (!callData) return;

    // Merge and maybe emit
    this.mergeBestAndMaybeEmit(callData, ev);
  }

  // ========== BUILD CALLDATA ==========
  parseCallEvent(ev) {
    const timestamp = new Date().toISOString();
    let { caller, callee } = TeleTrackCollector.resolvePartiesFromEvent(ev);

    const mem = this.recallCallMemory(ev);
    const isNum = (v) => !!v && /^\d{2,6}$/.test(String(v));
    const same = caller && callee && caller === callee;
    const terminal = ["DialEnd", "Hangup", "Cdr"].includes(ev.Event);

    if (isNum(mem.origin) && (terminal || !isNum(caller) || same)) caller = mem.origin;
    if (isNum(mem.target) && (terminal || !isNum(callee) || same || !callee || callee === "s")) callee = mem.target;

    // Final fallback: choose other endpoint
    if (!isNum(callee) && mem && mem.endpoints instanceof Set) {
      for (const ep of mem.endpoints) { if (isNum(ep) && ep !== caller) { callee = ep; break; } }
    }

    const direction = TeleTrackCollector.classifyDirection(caller, callee, ev);

    // Phone number: prefer caller, else callee
    const cleanNum = (v) =>
      String(v || "")
        .split(";")[0]
        .replace(/^(PJSIP|SIP|Local|IAX2|DAHDI)\//, "")
        .replace(/-[0-9a-f]+$/i, "")
        .replace(/^s$/, "")
        .trim();

    const phoneNumber = /^\d{2,6}$/.test(cleanNum(caller))
      ? cleanNum(caller)
      : /^\d{2,6}$/.test(cleanNum(callee))
      ? cleanNum(callee)
      : "Unknown";

    const callData = {
      uniqueId: ev.Uniqueid || ev.UniqueID,
      // linkedId: ev.Linkedid || ev.LinkedID || ev.Uniqueid || ev.UniqueID, // Commented out for database compatibility

      // čas iz eventa (UTC) – a končno poravnamo pri emit-u
      timestamp, // ISO UTC (za kompatibilnost)

      status: this.mapEventToStatus(ev.Event, ev),

      source: caller,
      destination: callee,
      // caller, // Commented out for database compatibility
      // callee, // Commented out for database compatibility
      callerName: ev.CallerIDName || null,
      direction,
      callType: direction,

      source_raw: ev.Channel || null,
      dest_raw: ev.DestChannel || ev.DestinationChannel || ev.BridgedChannel || ev.Channel2 || null,

      duration: parseInt(ev.Duration) || 0,
      billableSeconds: parseInt(ev.BillableSeconds) || 0,
      disposition: ev.Disposition || null,

      lastApp: ev.LastApp || null,
      context: ev.Context || null,
      destinationContext: ev.DestinationContext || null,
      lastData: ev.LastData || null,

      phoneNumber,
      rawEvent: ev,
    };

    return callData;
  }

  // ========== COALESCE & EMIT ==========
  mergeBestAndMaybeEmit(callData, ev) {
    const lid = callData.linkedId;
    if (!lid) {
      const out = this.ensurePhoneAndStatus(callData, null);
      out.isPrimary = true;
      return this.queueCallData(out);
    }

    const mem = this.callsByLinkedId.get(lid) || {
      endpoints: new Set(),
      best: null,
      lastAt: Date.now(),
      flushed: false,
      firstTsUTC: Date.now(),
      firstTsLocal: toLocalISOString(new Date()),
    };

    const score = (c) => {
      const goodParties =
        /^\d{2,6}$/.test(c.source || "") && /^\d{2,6}$/.test(c.destination || "") && c.destination !== "s";
      const terminal = ["ended", "completed", "answered", "missed", "busy", "failed"].includes(c.status);
      return (
        (Number(c.billableSeconds) || 0) * 1000 +
        (terminal ? 500 : 0) +
        (goodParties ? 200 : 0) +
        (c.status === "completed" || c.status === "answered" ? 100 : 0)
      );
    };

    if (!mem.best || score(callData) >= score(mem.best)) mem.best = { ...callData };
    mem.lastAt = Date.now();

    const terminalEvent = ["Hangup", "Cdr", "DialEnd"].includes(ev.Event);
    if (terminalEvent && !mem.flushed) {
      const out = this.ensurePhoneAndStatus({ ...mem.best }, mem);
      // poravnaj čase: start (mem) in end (now oz. iz duration)
      const now = new Date();
      out.timestampUtc = new Date(mem.firstTsUTC || Date.now()).toISOString();
      out.timestamp     = mem.firstTsLocal || toLocalISOString(new Date(mem.firstTsUTC || Date.now()));
      out.endTimeUtc    = now.toISOString();
      out.endTime       = toLocalISOString(now);
      if (out.duration && mem.firstTsUTC) {
        const endCalc = new Date(mem.firstTsUTC + out.duration * 1000);
        out.endTimeUtc = endCalc.toISOString();
        out.endTime    = toLocalISOString(endCalc);
      }
      // če ni disposition, ga inferiraj
      if (!out.disposition) {
        out.disposition =
          (out.status === "completed" || out.status === "answered" || (out.billableSeconds || 0) > 0)
            ? "ANSWERED"
            : "NO ANSWER";
      }
      out.isPrimary = true;
      this.queueCallData(out);
      mem.flushed = true;
    }

    this.callsByLinkedId.set(lid, mem);
  }

  ensurePhoneAndStatus(out, mem) {
    if (!out.phoneNumber || out.phoneNumber === "Unknown") {
      out.phoneNumber = /^\d{2,6}$/.test(out.source)
        ? out.source
        : /^\d{2,6}$/.test(out.destination)
        ? out.destination
        : "Unknown";
    }
    // če status ni v končnih labelah, ga zaključi glede na billsec
    const allowed = ["ended", "completed", "answered", "missed", "busy", "failed"];
    if (!allowed.includes(out.status)) {
      out.status = Number(out.billableSeconds) > 0 ? "completed" : "ended";
    }
    return out;
  }

  startStaleFlusher() {
    const staleMs = this.config.collector.staleMs;
    this.flushTimer = setInterval(() => {
      const now = Date.now();
      for (const [lid, mem] of this.callsByLinkedId.entries()) {
        if (!mem.flushed && now - mem.lastAt > staleMs && mem.best) {
          const out = this.ensurePhoneAndStatus({ ...mem.best }, mem);
          // poravnaj čase ob stale flushu
          const end = new Date();
          out.timestampUtc = new Date(mem.firstTsUTC || Date.now()).toISOString();
          out.timestamp     = mem.firstTsLocal || toLocalISOString(new Date(mem.firstTsUTC || Date.now()));
          out.endTimeUtc    = end.toISOString();
          out.endTime       = toLocalISOString(end);
          if (!out.disposition) {
            out.disposition =
              (out.status === "completed" || out.status === "answered" || (out.billableSeconds || 0) > 0)
                ? "ANSWERED"
                : "NO ANSWER";
          }
          out.isPrimary = true;
          this.queueCallData(out);
          mem.flushed = true;
          this.callsByLinkedId.set(lid, mem);
        }
        // čiščenje po nekaj ciklih
        if (mem.flushed && now - mem.lastAt > staleMs * 4) {
          this.callsByLinkedId.delete(lid);
        }
      }
    }, Math.max(3000, Math.floor(staleMs / 3)));
  }

  // ========== BATCH SEND ==========
  queueCallData(callData) {
    this.callQueue.push(callData);
    this.log("info", `Queued primary: uid=${callData.uniqueId} (${callData.status})`);
    
    // Save to database immediately
    this.saveCallToDatabase(callData);
    
    const size = this.config.collector.batchSize;
    const timeout = this.config.collector.batchTimeout;
    if (this.callQueue.length >= size) this.processBatch();
    else if (!this.batchTimer) this.batchTimer = setTimeout(() => this.processBatch(), timeout);
  }

  async processBatch() {
    if (!this.callQueue.length) return;
    const batch = this.callQueue.splice(0);
    this.batchTimer = null;
    this.log("info", `Processing ${batch.length} primary calls`);
    for (const item of batch) {
      try {
        await this.sendToCloud(item);
      } catch (e) {
        if (e.response) {
          this.log("error", `Send failed: HTTP ${e.response.status} ${JSON.stringify(e.response.data)}`);
        } else {
          this.log("error", `Send failed: ${e.message}`);
        }
      }
    }
  }

  async sendToCloud(callData) {
    const payload = {
      callData,
      collectorInfo: {
        name: this.config.collector.name,
        version: "coalescing-bridge-1.4",
        hostname: os.hostname(),
        ipAddress: this.getLocalIP(),
      },
    };
    this.log("debug", `POST payload: ${JSON.stringify(payload)}`);
    await axios.post(this.config.cloud.endpoint, payload, {
      headers: {
        Authorization: `Bearer ${this.config.organization.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: this.config.cloud.timeout || 30000,
    });
    this.log("debug",
      `Sent primary: uid=${callData.uniqueId}, src=${callData.source}, dst=${callData.destination}, status=${callData.status}, billsec=${callData.billableSeconds}`
    );
  }

  getLocalIP() {
    const ifs = os.networkInterfaces();
    for (const name of Object.keys(ifs)) {
      for (const i of ifs[name]) if (i.family === "IPv4" && !i.internal) return i.address;
    }
    return "127.0.0.1";
  }

  // ========== HEARTBEAT / SHUTDOWN ==========
  startHeartbeat() {
    const i = this.config.collector.heartbeatInterval;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat().catch(() => {}), i);
    this.log("info", `Heartbeat started (${i}ms)`);
  }

  async sendHeartbeat() {
    await axios.post(
      this.config.cloud.endpoint,
      {
        callData: null,
        collectorInfo: {
          name: this.config.collector.name,
          version: "coalescing-bridge-1.4",
          hostname: os.hostname(),
          ipAddress: this.getLocalIP(),
        },
      },
      { headers: { Authorization: `Bearer ${this.config.organization.apiKey}` }, timeout: 10000 }
    );
    this.log("debug", "Heartbeat sent");
  }

  async shutdown(signal) {
    this.log("info", `Shutting down (${signal})...`);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    for (const [lid, mem] of this.callsByLinkedId.entries()) {
      if (!mem.flushed && mem.best) {
        const out = this.ensurePhoneAndStatus({ ...mem.best }, mem);
        const end = new Date();
        out.timestampUtc = new Date(mem.firstTsUTC || Date.now()).toISOString();
        out.timestamp     = mem.firstTsLocal || toLocalISOString(new Date(mem.firstTsUTC || Date.now()));
        out.endTimeUtc    = end.toISOString();
        out.endTime       = toLocalISOString(end);
        if (!out.disposition) {
          out.disposition =
            (out.status === "completed" || out.status === "answered" || (out.billableSeconds || 0) > 0)
              ? "ANSWERED"
              : "NO ANSWER";
        }
        out.isPrimary = true;
        this.callQueue.push(out);
      }
    }
    if (this.callQueue.length) this.processBatch();

    if (this.socket) this.socket.end();
    
    // Close database connections
    if (this.dbPool) {
      await this.dbPool.end();
      this.log("info", "PostgreSQL connection pool closed");
    }
    if (this.db) {
      this.db.close();
      this.log("info", "SQLite database connection closed");
    }
    
    // Close log stream gracefully
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.end();
    }
    
    process.exit(0);
  }
}

if (require.main === module) {
  const c = new TeleTrackCollector();
  c.start().catch((e) => {
    console.error("Failed to start collector:", e);
    process.exit(1);
  });
}

module.exports = TeleTrackCollector;
