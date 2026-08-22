/**
 * Runs before cruise-*.js. Dual-writes the best fleet JWT onto every key and
 * drops expired / leftover launch tokens so the live cruise bundle does not
 * GET Railway /api/characters 401 four times.
 *
 * Loaded by drive Vercel middleware (inject into HTML) and Pages _middleware.
 */
(function velocityAuthBoot() {
  var KEYS = [
    "grudge.open.token",
    "grudge_auth_token",
    "grudge_session_token",
    "grudge.token",
    "sso_token",
    "grudge_token",
  ];
  function decode(t) {
    try {
      var p = t.split(".")[1];
      if (!p) return null;
      return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    } catch (e) {
      return null;
    }
  }
  function expired(payload) {
    if (!payload || !payload.exp) return false;
    return Date.now() / 1000 >= payload.exp - 60;
  }
  function consider(raw, sessionOut, launchOut) {
    if (!raw || raw.length < 20) return;
    var payload = decode(raw);
    if (!payload || expired(payload)) return;
    if (payload && payload.type === "launch") {
      if (launchOut.length === 0) launchOut.push(raw);
      return;
    }
    if (sessionOut.length === 0) sessionOut.push(raw);
  }
  var session = [];
  var launch = [];
  try {
    for (var i = 0; i < KEYS.length; i++) {
      consider(sessionStorage.getItem(KEYS[i]), session, launch);
      consider(localStorage.getItem(KEYS[i]), session, launch);
    }
  } catch (e) {
    return;
  }
  var chosen = session[0] || launch[0] || null;
  try {
    if (!chosen) {
      for (var j = 0; j < KEYS.length; j++) {
        localStorage.removeItem(KEYS[j]);
        sessionStorage.removeItem(KEYS[j]);
      }
      return;
    }
    for (var k = 0; k < KEYS.length; k++) {
      localStorage.setItem(KEYS[k], chosen);
      sessionStorage.setItem(KEYS[k], chosen);
    }
  } catch (e) {
    /* private mode */
  }
})();
