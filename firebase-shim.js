/* Campus Wortev – conexión a Firebase (Firestore + Authentication).
   Hace que la app guarde los datos en una base real en lugar del navegador.
   Expone window.claude.use("db" | "user" | "downloads") con la interfaz que usa la app. */
(function () {
  var C = window.CW_FIREBASE || {};
  var auth, fs, USER = null, PERFIL = null, ov = null, NEWNAME = "", busy = false;
  var COLS = ["members", "bookings", "companies", "staff", "quotes", "balances", "config"];
  var ROLES = { pendiente: "Pendiente (sin acceso)", viewer: "Solo consulta", editor: "Editor (opera la app)", owner: "Dueño", bloqueado: "Acceso revocado" };

  var css = "position:fixed;inset:0;z-index:9999;background:var(--bg,#FFF8F2);display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;font-family:Montserrat,system-ui,sans-serif;color:var(--tx,#072033)";
  var box = "background:#fff;border:1px solid var(--bd,#E6D8C7);border-radius:12px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,.08);margin:auto";
  var inp = "width:100%;box-sizing:border-box;padding:10px;margin:6px 0;border:1px solid var(--bd,#E6D8C7);border-radius:6px;font:inherit";
  var btn = "width:100%;padding:11px;margin-top:8px;border:0;border-radius:6px;background:var(--ac,#2A5135);color:#fff;font:inherit;cursor:pointer";
  var btn2 = "width:100%;padding:10px;margin-top:8px;border:1px solid var(--bd,#E6D8C7);border-radius:6px;background:#fff;color:var(--tx,#072033);font:inherit;cursor:pointer";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function show(inner, wide) {
    if (ov) ov.remove();
    ov = document.createElement("div"); ov.style.cssText = css;
    ov.innerHTML = '<div style="' + box + (wide ? ";max-width:760px" : "") + '">' + inner + "</div>";
    document.body.appendChild(ov); return ov;
  }
  function hide() { if (ov) { ov.remove(); ov = null; } }
  function fatal(msg) { show('<h3 style="margin:0 0 8px">Campus Wortev</h3><p style="font-size:14px;line-height:1.5;color:#B3261E">' + esc(msg) + "</p>"); }
  function errTxt(e) {
    var c = (e && e.code) || "";
    var m = {
      "auth/invalid-credential": "Correo o contraseña incorrectos.", "auth/wrong-password": "Correo o contraseña incorrectos.", "auth/user-not-found": "Correo o contraseña incorrectos.",
      "auth/invalid-email": "El correo no es válido.", "auth/email-already-in-use": "Ese correo ya tiene cuenta. Usa Entrar.", "auth/weak-password": "La contraseña es muy corta (mínimo 6 caracteres; usa 8 o más).",
      "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.", "auth/network-request-failed": "Sin conexión. Revisa tu internet.", "auth/missing-password": "Escribe tu contraseña.",
      "auth/unauthorized-domain": "Esta dirección no está autorizada en Firebase (Authentication → Settings → Authorized domains)."
    };
    return m[c] || ("Error: " + ((e && e.message) || c || "desconocido"));
  }

  function loginUI() {
    var o = show('<h3 style="margin:0 0 4px">Campus Wortev</h3><p style="margin:0 0 12px;font-size:13px;color:var(--mu,#5C6770)">Gestión del coworking · acceso del equipo</p>' +
      '<input id="cwn" placeholder="Tu nombre (solo para crear cuenta)" style="' + inp + '">' +
      '<input id="cwe" type="email" placeholder="Correo" autocomplete="username" style="' + inp + '">' +
      '<input id="cwp" type="password" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="current-password" style="' + inp + '">' +
      '<button id="cwin" style="' + btn + '">Entrar</button><button id="cwup" style="' + btn2 + '">Crear cuenta</button>' +
      '<button id="cwrs" style="background:none;border:0;margin-top:10px;font:inherit;font-size:12px;color:var(--mu,#5C6770);cursor:pointer;text-decoration:underline;width:100%">Olvidé mi contraseña</button>' +
      '<p id="cwm" style="font-size:13px;min-height:18px;margin:10px 0 0;color:#B3261E"></p>');
    var g = function (i) { return o.querySelector(i); }, msg = function (t, ok) { var m = g("#cwm"); m.style.color = ok ? "#2A5135" : "#B3261E"; m.textContent = t; };
    g("#cwin").onclick = function () {
      msg("");
      auth.signInWithEmailAndPassword(g("#cwe").value.trim(), g("#cwp").value).catch(function (e) { msg(errTxt(e)); });
    };
    g("#cwup").onclick = function () {
      msg(""); var nm = g("#cwn").value.trim();
      if (!nm) return msg("Escribe tu nombre para crear la cuenta");
      if (g("#cwp").value.length < 8) return msg("Usa una contraseña de al menos 8 caracteres");
      NEWNAME = nm;
      auth.createUserWithEmailAndPassword(g("#cwe").value.trim(), g("#cwp").value).catch(function (e) { NEWNAME = ""; msg(errTxt(e)); });
    };
    g("#cwrs").onclick = function () {
      var e = g("#cwe").value.trim(); if (!e) return msg("Escribe tu correo arriba");
      auth.sendPasswordResetEmail(e).then(function () { msg("Te enviamos un correo para cambiar la contraseña (revisa también spam).", true); }).catch(function (er) { msg(errTxt(er)); });
    };
    [g("#cwe"), g("#cwp")].forEach(function (i) { i.addEventListener("keydown", function (ev) { if (ev.key === "Enter") g("#cwin").click(); }); });
  }

  async function loadPerfil(u) {
    var ref = fs.collection("perfiles").doc(u.uid), s = await ref.get();
    if (!s.exists) {
      var p = { email: u.email || "", nombre: NEWNAME || u.displayName || (u.email || "").split("@")[0], rol: "pendiente", creado: new Date().toISOString() };
      await ref.set(p); return Object.assign({ id: u.uid }, p);
    }
    return Object.assign({ id: u.uid }, s.data());
  }

  async function enter(u, res) {
    if (busy) return; busy = true;
    try {
      USER = u; PERFIL = await loadPerfil(u);
    } catch (e) { busy = false; return fatal("No se pudo leer tu perfil: " + errTxt(e) + " ¿Ya publicaste las reglas de Firestore?"); }
    busy = false;
    if (PERFIL.rol === "bloqueado") {
      var ob = show('<h3 style="margin:0 0 8px">Acceso revocado</h3><p style="font-size:14px;line-height:1.5">El acceso de tu cuenta (' + esc(u.email) + ') a Campus Wortev fue revocado. Si crees que es un error, comunícate con la persona administradora.</p>' +
        '<button id="cwout" style="' + btn + '">Cerrar sesión</button>');
      ob.querySelector("#cwout").onclick = function () { auth.signOut().then(function () { location.reload(); }); };
      return;
    }
    if (PERFIL.rol === "pendiente") {
      var o = show('<h3 style="margin:0 0 8px">Cuenta pendiente de aprobación</h3><p style="font-size:14px;line-height:1.5">Tu cuenta (' + esc(u.email) + ') ya existe, pero la persona administradora de Campus Wortev aún debe darte acceso.</p>' +
        '<button id="cwck" style="' + btn + '">Revisar de nuevo</button><button id="cwout" style="' + btn2 + '">Cerrar sesión</button>');
      o.querySelector("#cwck").onclick = function () { enter(u, res); };
      o.querySelector("#cwout").onclick = function () { auth.signOut().then(function () { location.reload(); }); };
      return;
    }
    hide();
    var bar = document.createElement("div");
    bar.style.cssText = "position:fixed;top:8px;right:8px;z-index:60;display:flex;gap:6px";
    var bs = "padding:5px 10px;border:1px solid rgba(255,255,255,.5);border-radius:6px;background:rgba(0,0,0,.25);color:#fff;font:12px Montserrat,system-ui,sans-serif;cursor:pointer";
    if (PERFIL.rol === "owner") bar.innerHTML += '<button id="cweq" style="' + bs + '">Equipo y respaldo</button>';
    bar.innerHTML += '<button id="cwsa" style="' + bs + '">Salir</button>';
    document.body.appendChild(bar);
    bar.querySelector("#cwsa").onclick = function () { auth.signOut().then(function () { location.reload(); }); };
    if (PERFIL.rol === "owner") bar.querySelector("#cweq").onclick = equipoUI;
    res(true);
    if (PERFIL.rol === "owner") seedCheck();
  }

  /* ---- primera vez: cargar configuración inicial (precios, espacios, oficinas, servicios) ---- */
  async function seedCheck() {
    try {
      var s = await fs.collection("config").doc("main").get(); if (s.exists) return;
      var r = await fetch("datos-iniciales.json", { cache: "no-store" }); if (!r.ok) return;
      var seed = await r.json(), main = seed.config && seed.config.main; if (!main) return;
      var o = show('<h3 style="margin:0 0 8px">Base de datos nueva</h3><p style="font-size:14px;line-height:1.5">Tu base está vacía. ¿Quieres cargar la configuración inicial de Campus Wortev (membresías y precios, espacios, servicios de comida, estudio y oficinas)? No incluye clientes ni reservas.</p>' +
        '<button id="cwsd" style="' + btn + '">Sí, cargar configuración inicial</button><button id="cwno" style="' + btn2 + '">Ahora no</button><p id="cwm" style="font-size:13px;min-height:18px;margin:10px 0 0"></p>');
      o.querySelector("#cwno").onclick = hide;
      o.querySelector("#cwsd").onclick = async function () {
        try { await fs.collection("config").doc("main").set(main); hide(); }
        catch (e) { o.querySelector("#cwm").style.color = "#B3261E"; o.querySelector("#cwm").textContent = errTxt(e); }
      };
    } catch (e) { }
  }

  /* ---- panel del dueño: aprobar personas y descargar respaldo ---- */
  async function equipoUI() {
    var snap = await fs.collection("perfiles").get(), L = [];
    snap.forEach(function (d) { L.push(Object.assign({ id: d.id }, d.data())); });
    L.sort(function (a, b) { return (a.creado || "") < (b.creado || "") ? -1 : 1; });
    var o = show('<div style="display:flex;align-items:center"><h3 style="margin:0">Equipo y respaldo</h3><button id="cwx" style="margin-left:auto;padding:6px 12px;border:1px solid var(--bd,#E6D8C7);border-radius:6px;background:#fff;cursor:pointer;font:inherit">Cerrar</button></div>' +
      '<p style="font-size:13px;color:var(--mu,#5C6770)">Asigna a cada persona su rol. <b>Pendiente</b>: no ve nada. <b>Acceso revocado</b>: bloqueada, no puede volver a pedir acceso. <b>Solo consulta</b>: ve todo y no cambia nada. <b>Editor</b>: opera la app. <b>Dueño</b>: todo, incluido Admin y esta pantalla.</p>' +
      '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left"><th style="padding:6px">Nombre</th><th>Correo</th><th>Rol</th><th></th></tr></thead><tbody>' +
      L.map(function (p) {
        return '<tr style="border-top:1px solid var(--bd,#E6D8C7)"><td style="padding:6px">' + esc(p.nombre) + '</td><td>' + esc(p.email) + '</td><td><select data-id="' + esc(p.id) + '" style="font:inherit;padding:4px">' +
          Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (k === p.rol ? " selected" : "") + ">" + ROLES[k] + "</option>"; }).join("") + "</select></td><td>" + (p.id === USER.uid ? "" : (p.rol === "bloqueado" ? '<button data-rst="' + esc(p.id) + '" style="font:inherit;padding:4px 8px;border:1px solid var(--bd,#E6D8C7);background:#fff;border-radius:6px;cursor:pointer;margin-right:4px">Restablecer</button>' : '<button data-rev="' + esc(p.id) + '" data-n="' + esc(p.nombre || p.email) + '" style="font:inherit;padding:4px 8px;border:1px solid #B3261E;color:#B3261E;background:#fff;border-radius:6px;cursor:pointer;margin-right:4px">Revocar acceso</button>') + '<button data-del="' + esc(p.id) + '" data-n="' + esc(p.nombre || p.email) + '" style="font:inherit;padding:4px 8px;border:1px solid #B3261E;color:#B3261E;background:#fff;border-radius:6px;cursor:pointer">Quitar</button>') + "</td></tr>";
      }).join("") + '</tbody></table></div><p id="cwm" style="font-size:13px;min-height:18px;margin:8px 0"></p>' +
      '<hr style="border:0;border-top:1px solid var(--bd,#E6D8C7);margin:12px 0"><h4 style="margin:0 0 6px">Respaldo</h4><p style="font-size:13px;color:var(--mu,#5C6770);margin:0 0 6px">Descarga un archivo con todos los datos (miembros, empresas, saldos, reservas, cotizaciones, staff y configuración). Hazlo con regularidad y guárdalo en un lugar privado.</p>' +
      '<button id="cwbk" style="' + btn + '">Descargar respaldo completo (JSON)</button>', true);
    var m = o.querySelector("#cwm");
    o.querySelector("#cwx").onclick = hide;
    o.querySelectorAll("select[data-id]").forEach(function (s) {
      s.onchange = function () {
        var id = s.getAttribute("data-id");
        if (id === USER.uid && s.value !== "owner" && !confirm("Vas a quitarte el rol de Dueño a ti misma/o. ¿Seguro?")) { s.value = "owner"; return; }
        fs.collection("perfiles").doc(id).update({ rol: s.value }).then(function () { if (s.value === "bloqueado") { fs.collection("config").doc("admins").update({ ids: firebase.firestore.FieldValue.arrayRemove(id) }).catch(function () { }); } m.style.color = "#2A5135"; m.textContent = "Guardado."; }).catch(function (e) { m.style.color = "#B3261E"; m.textContent = errTxt(e); });
      };
    });
    async function setRol(id, rol, ok) {
      try {
        await fs.collection("perfiles").doc(id).update({ rol: rol });
        if (rol === "bloqueado") { try { await fs.collection("config").doc("admins").update({ ids: firebase.firestore.FieldValue.arrayRemove(id) }); } catch (e2) { } }
        m.style.color = "#2A5135"; m.textContent = ok; setTimeout(function () { equipoUI(); }, 600);
      } catch (e) { m.style.color = "#B3261E"; m.textContent = errTxt(e); }
    }
    o.querySelectorAll("button[data-rev]").forEach(function (b) {
      b.onclick = function () {
        if (!confirm("¿Revocar el acceso de " + b.getAttribute("data-n") + "? Dejará de ver y editar datos de inmediato. Su cuenta se conserva en la lista y no podrá volver a pedir acceso; tú puedes restablecerla cuando quieras.")) return;
        setRol(b.getAttribute("data-rev"), "bloqueado", "Acceso revocado.");
      };
    });
    o.querySelectorAll("button[data-rst]").forEach(function (b) {
      b.onclick = function () { setRol(b.getAttribute("data-rst"), "pendiente", "Restablecida como pendiente. Asígnale un rol si debe volver a entrar."); };
    });
    o.querySelectorAll("button[data-del]").forEach(function (b) {
      b.onclick = async function () {
        var id = b.getAttribute("data-del");
        if (!confirm("¿Quitar a " + b.getAttribute("data-n") + "? Perderá el acceso a la app de inmediato. Podrá volver a pedir acceso creando cuenta o entrando de nuevo, y tú decidirás si lo apruebas.")) return;
        try {
          await fs.collection("perfiles").doc(id).delete();
          try { await fs.collection("config").doc("admins").update({ ids: firebase.firestore.FieldValue.arrayRemove(id) }); } catch (e2) { }
          var tr = b.closest("tr"); if (tr) tr.remove();
          m.style.color = "#2A5135"; m.textContent = "Acceso quitado.";
        } catch (e) { m.style.color = "#B3261E"; m.textContent = errTxt(e); }
      };
    });
    o.querySelector("#cwbk").onclick = async function () {
      try {
        var out = { exportado: new Date().toISOString(), colecciones: {} };
        for (var i = 0; i < COLS.length; i++) {
          var s = await fs.collection(COLS[i]).get(), a = [];
          s.forEach(function (d) { a.push({ id: d.id, data: d.data() }); });
          out.colecciones[COLS[i]] = a;
        }
        await downloads.save({ filename: "respaldo-campus-wortev-" + new Date().toISOString().slice(0, 10) + ".json", data: new TextEncoder().encode(JSON.stringify(out, null, 1)).buffer });
        m.style.color = "#2A5135"; m.textContent = "Respaldo descargado.";
      } catch (e) { m.style.color = "#B3261E"; m.textContent = errTxt(e); }
    };
  }

  /* ---- interfaz que usa la app ---- */
  var db = {
    collection: function (c) {
      var col = fs.collection(c);
      return {
        onSnapshot: function (ok, err) { return col.onSnapshot(function (s) { ok(s); }, function (e) { if (err) err(e); }); },
        doc: function (id) {
          var r = col.doc(id);
          return { set: function (d) { return r.set(JSON.parse(JSON.stringify(d))); }, delete: function () { return r.delete(); } };
        }
      };
    }
  };
  var rol = function () { return PERFIL ? PERFIL.rol : "pendiente"; };
  var user = {
    me: async function () { return { id: USER.uid, name: PERFIL.nombre || USER.email }; },
    can: async function (n) { return n === "data.write" ? (rol() === "editor" || rol() === "owner") : null; },
    canEdit: async function () { return rol() === "editor" || rol() === "owner"; },
    isOwner: async function () { return rol() === "owner"; },
    profiles: async function (ids) {
      var out = {}; ids = (ids || []).slice(0, 64);
      await Promise.all(ids.map(function (id) { return fs.collection("perfiles").doc(id).get().then(function (s) { if (s.exists) out[id] = { name: s.data().nombre || s.data().email || "", guest: false }; }).catch(function () { }); }));
      return out;
    },
    search: async function (q) {
      var s = await fs.collection("perfiles").get(), L = []; q = (q || "").toLowerCase();
      s.forEach(function (d) { var p = d.data(); if (p.rol && p.rol !== "pendiente" && (!q || ((p.nombre || "") + " " + (p.email || "")).toLowerCase().indexOf(q) >= 0)) L.push({ id: d.id, name: p.nombre || p.email }); });
      return L;
    }
  };
  var downloads = {
    save: async function (o) {
      var ext = (o.filename.split(".").pop() || "").toLowerCase();
      var type = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv;charset=utf-8", pdf: "application/pdf", json: "application/json" }[ext] || "application/octet-stream";
      var u = URL.createObjectURL(new Blob([o.data], { type: type })), a = document.createElement("a");
      a.href = u; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    }
  };

  var ready = new Promise(function (res) {
    if (!window.firebase || !C.apiKey || /TU-/.test(C.apiKey + (C.projectId || ""))) { fatal("Falta configurar la conexión a la base de datos (archivo config.js)."); return; }
    try { firebase.initializeApp(C); auth = firebase.auth(); fs = firebase.firestore(); } catch (e) { fatal("No se pudo iniciar Firebase: " + e.message); return; }
    var first = true;
    auth.onAuthStateChanged(function (u) {
      if (!u) { USER = null; PERFIL = null; loginUI(); return; }
      enter(u, res);
    });
  });
  window.claude = { use: async function (n) { await ready; return n === "db" ? db : n === "user" ? user : n === "downloads" ? downloads : null; } };
})();
