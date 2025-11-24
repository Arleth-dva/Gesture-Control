// logger.js
export const GestureLogger = {
  logs: [],
  add(entry) {
    const iso = (new Date()).toISOString();
    this.logs.push(Object.assign({ recorded_at: iso }, entry));
    if (this.logs.length > 5000) this.logs.shift();
  },
  clear() {
    this.logs = [];
  },
  getPayload(meta={}) {
    return {
      meta: Object.assign({
        created_at: (new Date()).toISOString(),
        user_agent: navigator.userAgent || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null
      }, meta),
      records: this.logs
    };
  },
  exportJSON(filename = 'gesture_logs.json', meta={}) {
    const payload = this.getPayload(meta);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }
};
