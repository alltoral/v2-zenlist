(function(){
"use strict";

/* =========================================================
   CONSTANTS
   ========================================================= */
var COLORS = [
  { id:"slate",  hex:"#8D97A8" },
  { id:"coral",  hex:"#FF7A63" },
  { id:"amber",  hex:"#FFAE42" },
  { id:"green",  hex:"#28C58B" },
  { id:"sky",    hex:"#3E9CFF" },
  { id:"violet", hex:"#8B7CF6" },
  { id:"pink",   hex:"#FF62A8" }
];
var DEFAULT_COLUMNS = ["A fazer", "Em andamento", "Concluído"];
var STICKERS = [
  { id:"grumpy",  src:"icons/stickers/sticker-grumpy.png",  label:"Insatisfeito" },
  { id:"painter", src:"icons/stickers/sticker-painter.png", label:"Em produção" },
  { id:"party",   src:"icons/stickers/sticker-party.png",   label:"Concluído, comemorar!" },
  { id:"gamer",   src:"icons/stickers/sticker-gamer.png",   label:"Em foco" },
  { id:"rainy",   src:"icons/stickers/sticker-rainy.png",   label:"Bloqueado / desanimado" },
  { id:"playful", src:"icons/stickers/sticker-playful.png", label:"Tranquilo, sem pressa" },
  { id:"reading", src:"icons/stickers/sticker-reading.png", label:"Em análise / dúvida" }
];
var selectedStickerId = null;

/* =========================================================
   UTIL
   ========================================================= */
function uid(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,9);
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, function(c){
    return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];
  });
}
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
function el(tag, cls, html){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function toast(msg){
  var t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.hidden = true; }, 2200);
}
function formatDate(iso){
  if (!iso) return "";
  var parts = iso.split("-");
  return parts[2] + "/" + parts[1];
}
function isOverdue(iso){
  if (!iso) return false;
  var today = new Date(); today.setHours(0,0,0,0);
  var d = new Date(iso + "T00:00:00");
  return d < today;
}
function todayISO(){
  var d = new Date();
  var mm = String(d.getMonth()+1).padStart(2,"0");
  var dd = String(d.getDate()).padStart(2,"0");
  return d.getFullYear() + "-" + mm + "-" + dd;
}
function formatLongDate(iso){
  var d = new Date(iso + "T00:00:00");
  var s = d.toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* =========================================================
   STATE (sincronizado via Firebase Firestore)
   ========================================================= */
var state = { projects: [], activeProjectId: null };
var currentUid = null;
var unsubscribeSnapshot = null;
var dueTodayNotified = false;
var auth = null;
var db = null;

function initFirebase(){
  if (!window.firebase || !window.FIREBASE_CONFIG){
    console.warn("Firebase não carregado ou não configurado.");
    return false;
  }
  if (window.FIREBASE_CONFIG.apiKey === "COLE_AQUI_SUA_API_KEY"){
    console.warn("firebase-config.js ainda não foi preenchido com as chaves do projeto.");
    return false;
  }
  try{
    firebase.initializeApp(window.FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(function(err){
      console.warn("Persistência offline não disponível:", err.code);
    });
    return true;
  }catch(e){
    console.error("Erro ao iniciar o Firebase", e);
    return false;
  }
}

function saveState(){
  if (!currentUid || !db) return;
  setSyncStatus("syncing");
  db.collection("zenlist_users").doc(currentUid).set({
    data: state,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(function(){
    setSyncStatus("synced");
  }).catch(function(err){
    console.error("Falha ao salvar no Firestore", err);
    setSyncStatus("offline");
    toast("Sem conexão agora — suas mudanças serão sincronizadas quando a internet voltar.");
  });
}

function setupFirestoreSync(uid){
  if (unsubscribeSnapshot){ unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  dueTodayNotified = false;
  setSyncStatus("syncing");
  unsubscribeSnapshot = db.collection("zenlist_users").doc(uid).onSnapshot(function(doc){
    if (doc.exists && doc.data() && doc.data().data){
      state = doc.data().data;
    } else {
      state = { projects: [], activeProjectId: null };
    }
    var needsSave = ensureDailyChecklist();
    renderAll();
    renderDailyPanel();
    setSyncStatus(doc.metadata.fromCache ? "offline" : "synced");
    if (needsSave) saveState();
    if (!dueTodayNotified){
      var shown = showDueTodayNotification();
      if (shown) dueTodayNotified = true;
    }
  }, function(err){
    console.error("Erro na sincronização", err);
    setSyncStatus("offline");
  });
}

function ensureDailyChecklist(){
  var today = todayISO();
  if (!state.daily || typeof state.daily !== "object"){
    state.daily = { date: today, items: [] };
    return true;
  }
  if (!Array.isArray(state.daily.items)) state.daily.items = [];
  if (state.daily.date !== today){
    state.daily.items.forEach(function(i){ i.done = false; });
    state.daily.date = today;
    return true;
  }
  return false;
}

function setSyncStatus(status){
  var box = $("#syncStatus");
  if (!box) return;
  box.classList.remove("offline", "syncing");
  var label = "Sincronizado";
  if (status === "offline"){ box.classList.add("offline"); label = "Offline"; }
  else if (status === "syncing"){ box.classList.add("syncing"); label = "Sincronizando…"; }
  var txt = $(".sync-status-text", box);
  if (txt) txt.textContent = label;
  box.title = status === "offline"
    ? "Sem conexão — suas mudanças serão sincronizadas depois"
    : (status === "syncing" ? "Sincronizando…" : "Sincronizado com a nuvem");
}
function getActiveProject(){
  return state.projects.find(function(p){ return p.id === state.activeProjectId; }) || null;
}
function getProject(id){
  return state.projects.find(function(p){ return p.id === id; }) || null;
}

/* =========================================================
   MODEL OPERATIONS
   ========================================================= */
function createProject(name, colorId){
  var proj = {
    id: uid(),
    name: name.trim() || "Novo projeto",
    color: colorId || "violet",
    columns: DEFAULT_COLUMNS.map(function(n){ return { id: uid(), name: n }; }),
    cards: []
  };
  state.projects.push(proj);
  state.activeProjectId = proj.id;
  saveState();
  return proj;
}
function renameProject(id, name){
  var p = getProject(id);
  if (p && name.trim()) { p.name = name.trim(); saveState(); }
}
function recolorProject(id, colorId){
  var p = getProject(id);
  if (p) { p.color = colorId; saveState(); }
}
function deleteProject(id){
  state.projects = state.projects.filter(function(p){ return p.id !== id; });
  if (state.activeProjectId === id){
    state.activeProjectId = state.projects.length ? state.projects[0].id : null;
  }
  saveState();
}

function addColumn(project, name){
  project.columns.push({ id: uid(), name: name.trim() || "Nova coluna" });
  saveState();
}
function renameColumn(project, colId, name){
  var c = project.columns.find(function(c){ return c.id === colId; });
  if (c && name.trim()) { c.name = name.trim(); saveState(); }
}
function deleteColumn(project, colId){
  project.columns = project.columns.filter(function(c){ return c.id !== colId; });
  project.cards = project.cards.filter(function(c){ return c.columnId !== colId; });
  saveState();
}

function addCard(project, columnId, data){
  var card = {
    id: uid(),
    columnId: columnId,
    title: data.title.trim(),
    desc: (data.desc||"").trim(),
    color: data.color || "slate",
    due: data.due || "",
    checklist: data.checklist || [],
    stickers: [],
    createdAt: Date.now()
  };
  project.cards.push(card);
  saveState();
  return card;
}
function updateCard(project, cardId, data){
  var c = project.cards.find(function(c){ return c.id === cardId; });
  if (!c) return;
  c.title = data.title.trim();
  c.desc = (data.desc||"").trim();
  c.color = data.color || "slate";
  c.due = data.due || "";
  c.checklist = data.checklist || [];
  saveState();
}
function deleteCard(project, cardId){
  project.cards = project.cards.filter(function(c){ return c.id !== cardId; });
  saveState();
}
function cardsForColumn(project, columnId){
  return project.cards.filter(function(c){ return c.columnId === columnId; });
}
function addStickerToCard(project, cardId, stickerId){
  var card = project.cards.find(function(c){ return c.id === cardId; });
  if (!card) return;
  if (!card.stickers) card.stickers = [];
  if (card.stickers.indexOf(stickerId) !== -1){ toast("Essa figurinha já está no card."); return; }
  if (card.stickers.length >= 4){ toast("Máximo de 4 figurinhas por card."); return; }
  card.stickers.push(stickerId);
  saveState();
}
function removeStickerFromCard(project, cardId, stickerId){
  var card = project.cards.find(function(c){ return c.id === cardId; });
  if (!card) return;
  card.stickers = (card.stickers || []).filter(function(id){ return id !== stickerId; });
  saveState();
}

/* =========================================================
   RENDER: SIDEBAR
   ========================================================= */
function renderSidebar(){
  var list = $("#projectList");
  list.innerHTML = "";
  var empty = $("#sidebarEmpty");
  empty.hidden = state.projects.length > 0;

  state.projects.forEach(function(p){
    var colorHex = (COLORS.find(function(c){ return c.id === p.color; }) || COLORS[0]).hex;
    var item = el("div", "project-item" + (p.id === state.activeProjectId ? " active" : ""));
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.dataset.id = p.id;

    var dot = el("span", "project-dot");
    dot.style.background = colorHex;

    var name = el("span", "project-item-name", escapeHtml(p.name));

    var menu = el("span", "project-item-menu");
    menu.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>';
    menu.title = "Editar projeto";
    menu.addEventListener("click", function(ev){
      ev.stopPropagation();
      openProjectPrompt(p);
    });

    item.appendChild(dot);
    item.appendChild(name);
    item.appendChild(menu);

    item.addEventListener("click", function(){
      state.activeProjectId = p.id;
      saveState();
      renderAll();
      closeMobileSidebar();
      closeStickerTray();
    });
    item.addEventListener("keydown", function(ev){
      if (ev.key === "Enter" || ev.key === " ") item.click();
    });

    list.appendChild(item);
  });
}

/* =========================================================
   RENDER: BOARD
   ========================================================= */
function renderBoard(){
  var board = $("#board");
  var boardEmpty = $("#boardEmpty");
  var project = getActiveProject();

  if (!project){
    board.hidden = true;
    boardEmpty.hidden = false;
    board.innerHTML = "";
    return;
  }
  boardEmpty.hidden = true;
  board.hidden = false;
  board.innerHTML = "";

  project.columns.forEach(function(col){
    board.appendChild(renderColumn(project, col));
  });

  var addColBtn = el("button", "add-column");
  addColBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><span>Adicionar coluna</span>';
  addColBtn.addEventListener("click", function(){ openColumnPrompt(project, null); });
  board.appendChild(addColBtn);

  setupColumnDragTargets(project);
}

function renderColumn(project, col){
  var wrap = el("div", "column");
  wrap.dataset.columnId = col.id;

  var head = el("div", "column-head");
  head.draggable = true;
  head.dataset.columnId = col.id;

  var title = el("input", "column-title");
  title.value = col.name;
  title.setAttribute("aria-label", "Nome da coluna");
  title.addEventListener("change", function(){
    renameColumn(project, col.id, title.value || col.name);
    renderBoard();
  });
  title.addEventListener("keydown", function(ev){ if (ev.key === "Enter") title.blur(); });

  var cards = cardsForColumn(project, col.id);
  var count = el("span", "column-count", String(cards.length));

  var menuBtn = el("button", "icon-btn small column-menu-btn");
  menuBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>';
  menuBtn.title = "Excluir coluna";
  menuBtn.addEventListener("click", function(){
    if (confirm('Excluir a coluna "' + col.name + '" e todos os cards dela?')){
      deleteColumn(project, col.id);
      renderBoard();
    }
  });

  head.appendChild(title);
  head.appendChild(count);
  head.appendChild(menuBtn);
  wrap.appendChild(head);

  var cardsWrap = el("div", "column-cards");
  cardsWrap.dataset.columnId = col.id;
  cards.forEach(function(card){
    cardsWrap.appendChild(renderCard(project, card));
  });
  wrap.appendChild(cardsWrap);
  setupCardDropZone(project, cardsWrap);

  var addCardBtn = el("button", "column-add-card");
  addCardBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><span>Adicionar card</span>';
  addCardBtn.addEventListener("click", function(){ openCardModal(project, col.id, null); });
  wrap.appendChild(addCardBtn);

  return wrap;
}

function renderCard(project, card){
  var c = el("div", "card");
  c.dataset.cardId = card.id;
  c.dataset.color = card.color;
  c.draggable = true;

  var cardStickers = card.stickers || [];
  if (cardStickers.length){
    c.classList.add("has-stickers");
    var stickerRow = el("div", "card-stickers");
    cardStickers.forEach(function(sid){
      var stk = STICKERS.find(function(s){ return s.id === sid; });
      if (!stk) return;
      var simg = el("img", "card-sticker");
      simg.src = stk.src;
      simg.alt = stk.label;
      simg.title = stk.label + " — clique para remover";
      simg.addEventListener("click", function(ev){
        ev.stopPropagation();
        removeStickerFromCard(project, card.id, sid);
        renderBoard();
      });
      stickerRow.appendChild(simg);
    });
    c.appendChild(stickerRow);
  }

  var title = el("div", "card-title", escapeHtml(card.title));
  c.appendChild(title);

  if (card.desc){
    c.appendChild(el("div", "card-desc", escapeHtml(card.desc)));
  }

  var meta = el("div", "card-meta");
  var done = card.checklist.filter(function(i){ return i.done; }).length;
  var total = card.checklist.length;
  if (total > 0){
    var pill = el("span", "card-checklist-pill");
    pill.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/></svg>' + done + "/" + total;
    meta.appendChild(pill);
    var track = el("div", "card-progress-track");
    var bar = el("div", "card-progress-bar");
    bar.style.width = (total ? Math.round(done/total*100) : 0) + "%";
    track.appendChild(bar);
    meta.appendChild(track);
  }
  if (card.due){
    var due = el("span", "card-due" + (isOverdue(card.due) ? " overdue" : ""));
    due.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' + formatDate(card.due);
    meta.appendChild(due);
  }
  if (meta.childNodes.length) c.appendChild(meta);

  c.addEventListener("click", function(){
    if (selectedStickerId){
      addStickerToCard(project, card.id, selectedStickerId);
      selectedStickerId = null;
      $all(".sticker-thumb").forEach(function(t){ t.classList.remove("selected"); });
      renderBoard();
      return;
    }
    closeStickerTray();
    openCardModal(project, card.columnId, card.id);
  });

  c.addEventListener("dragstart", function(ev){
    c.classList.add("dragging");
    ev.dataTransfer.setData("text/plain", card.id);
    ev.dataTransfer.effectAllowed = "move";
  });
  c.addEventListener("dragend", function(){
    c.classList.remove("dragging");
    syncCardOrderFromDOM(project);
  });

  c.addEventListener("dragover", function(ev){
    if (ev.dataTransfer.types.indexOf("application/x-sticker") !== -1){
      ev.preventDefault();
      ev.stopPropagation();
      c.classList.add("sticker-drop-target");
    }
  });
  c.addEventListener("dragleave", function(){ c.classList.remove("sticker-drop-target"); });
  c.addEventListener("drop", function(ev){
    if (ev.dataTransfer.types.indexOf("application/x-sticker") !== -1){
      ev.preventDefault();
      ev.stopPropagation();
      c.classList.remove("sticker-drop-target");
      var stickerId = ev.dataTransfer.getData("application/x-sticker");
      addStickerToCard(project, card.id, stickerId);
      renderBoard();
    }
  });

  return c;
}

/* =========================================================
   DRAG & DROP: CARDS
   ========================================================= */
function getDragAfterElement(container, y){
  var els = $all(".card:not(.dragging)", container);
  var result = { offset: Number.NEGATIVE_INFINITY, element: null };
  els.forEach(function(child){
    var box = child.getBoundingClientRect();
    var offset = y - box.top - box.height/2;
    if (offset < 0 && offset > result.offset){
      result = { offset: offset, element: child };
    }
  });
  return result.element;
}
function setupCardDropZone(project, container){
  container.addEventListener("dragover", function(ev){
    ev.preventDefault();
    var dragging = $(".card.dragging");
    if (!dragging) return;
    container.classList.add("drag-over-slot");
    var after = getDragAfterElement(container, ev.clientY);
    if (after == null){
      container.appendChild(dragging);
    } else {
      container.insertBefore(dragging, after);
    }
  });
  container.addEventListener("dragleave", function(){ container.classList.remove("drag-over-slot"); });
  container.addEventListener("drop", function(ev){
    ev.preventDefault();
    container.classList.remove("drag-over-slot");
    var cardId = ev.dataTransfer.getData("text/plain");
    var card = project.cards.find(function(c){ return c.id === cardId; });
    if (card) card.columnId = container.dataset.columnId;
    syncCardOrderFromDOM(project);
  });
}
function syncCardOrderFromDOM(project){
  var newCards = [];
  $all(".column-cards").forEach(function(container){
    var colId = container.dataset.columnId;
    $all(".card", container).forEach(function(cardEl){
      var c = project.cards.find(function(c){ return c.id === cardEl.dataset.cardId; });
      if (c){ c.columnId = colId; newCards.push(c); }
    });
  });
  // preserve any cards not currently rendered (shouldn't happen, but safe)
  project.cards.forEach(function(c){
    if (newCards.indexOf(c) === -1) newCards.push(c);
  });
  project.cards = newCards;
  saveState();
  renderColumnCounts(project);
}
function renderColumnCounts(project){
  $all(".column").forEach(function(colEl){
    var colId = colEl.dataset.columnId;
    var n = cardsForColumn(project, colId).length;
    var badge = $(".column-count", colEl);
    if (badge) badge.textContent = String(n);
  });
}

/* =========================================================
   DRAG & DROP: COLUMNS
   ========================================================= */
function setupColumnDragTargets(project){
  var board = $("#board");
  var draggingCol = null;

  $all(".column-head").forEach(function(head){
    head.addEventListener("dragstart", function(ev){
      draggingCol = head.closest(".column");
      draggingCol.classList.add("dragging");
      ev.dataTransfer.setData("text/plain", "col:" + head.dataset.columnId);
      ev.dataTransfer.effectAllowed = "move";
    });
    head.addEventListener("dragend", function(){
      if (draggingCol) draggingCol.classList.remove("dragging");
      draggingCol = null;
      syncColumnOrderFromDOM(project);
    });
  });

  board.addEventListener("dragover", function(ev){
    if (!draggingCol) return;
    ev.preventDefault();
    var afterEl = getColumnAfterElement(board, ev.clientX);
    if (afterEl == null){
      board.insertBefore(draggingCol, $(".add-column", board));
    } else if (afterEl !== draggingCol){
      board.insertBefore(draggingCol, afterEl);
    }
  });
}
function getColumnAfterElement(board, x){
  var els = $all(".column:not(.dragging)", board);
  var result = { offset: Number.NEGATIVE_INFINITY, element: null };
  els.forEach(function(child){
    var box = child.getBoundingClientRect();
    var offset = x - box.left - box.width/2;
    if (offset < 0 && offset > result.offset){
      result = { offset: offset, element: child };
    }
  });
  return result.element;
}
function syncColumnOrderFromDOM(project){
  var order = $all(".column").map(function(colEl){ return colEl.dataset.columnId; });
  project.columns.sort(function(a,b){ return order.indexOf(a.id) - order.indexOf(b.id); });
  saveState();
}

/* =========================================================
   MODAL: CARD
   ========================================================= */
var cardModalCtx = { project:null, columnId:null, cardId:null, checklist:[] };

function openCardModal(project, columnId, cardId){
  cardModalCtx.project = project;
  cardModalCtx.columnId = columnId;
  cardModalCtx.cardId = cardId;

  var existing = cardId ? project.cards.find(function(c){ return c.id === cardId; }) : null;
  cardModalCtx.checklist = existing ? existing.checklist.map(function(i){ return { id:i.id, text:i.text, done:i.done }; }) : [];

  $("#cardModalTitle").textContent = existing ? "Editar card" : "Novo card";
  $("#cardTitle").value = existing ? existing.title : "";
  $("#cardDesc").value = existing ? existing.desc : "";
  $("#cardDue").value = existing ? existing.due : "";
  $("#btnDeleteCard").hidden = !existing;

  renderColorSwatches($("#colorSwatches"), existing ? existing.color : "slate");
  renderChecklistItems();

  $("#cardModal").hidden = false;
  setTimeout(function(){ $("#cardTitle").focus(); }, 30);
}
function closeCardModal(){ $("#cardModal").hidden = true; }

function renderColorSwatches(container, selected){
  container.innerHTML = "";
  container.dataset.selected = selected;
  COLORS.forEach(function(c){
    var sw = el("button", "swatch" + (c.id === selected ? " selected" : ""));
    sw.type = "button";
    sw.style.background = c.hex;
    sw.title = c.id;
    sw.setAttribute("aria-label", "Cor " + c.id);
    sw.addEventListener("click", function(){
      container.dataset.selected = c.id;
      $all(".swatch", container).forEach(function(s){ s.classList.remove("selected"); });
      sw.classList.add("selected");
    });
    container.appendChild(sw);
  });
}

function renderChecklistItems(){
  var ul = $("#checklistItems");
  ul.innerHTML = "";
  cardModalCtx.checklist.forEach(function(item){
    var li = el("li", "checklist-item" + (item.done ? " is-done" : ""));
    var circle = el("span", "check-circle" + (item.done ? " done" : ""));
    circle.setAttribute("role", "checkbox");
    circle.setAttribute("aria-checked", String(!!item.done));
    circle.tabIndex = 0;
    circle.addEventListener("click", function(){
      item.done = !item.done;
      renderChecklistItems();
    });
    circle.addEventListener("keydown", function(ev){ if (ev.key === "Enter" || ev.key === " ") circle.click(); });

    var text = el("span", "checklist-item-text", escapeHtml(item.text));
    var del = el("span", "checklist-item-del");
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    del.addEventListener("click", function(){
      cardModalCtx.checklist = cardModalCtx.checklist.filter(function(i){ return i !== item; });
      renderChecklistItems();
    });

    li.appendChild(circle); li.appendChild(text); li.appendChild(del);
    ul.appendChild(li);
  });
  var total = cardModalCtx.checklist.length;
  var done = cardModalCtx.checklist.filter(function(i){ return i.done; }).length;
  $("#checklistProgressText").textContent = done + "/" + total;
  $("#checklistProgressBar").style.width = (total ? Math.round(done/total*100) : 0) + "%";
}

$("#checklistAddForm").addEventListener("submit", function(ev){
  ev.preventDefault();
  var input = $("#checklistNewItem");
  var text = input.value.trim();
  if (!text) return;
  cardModalCtx.checklist.push({ id: uid(), text: text, done:false });
  input.value = "";
  renderChecklistItems();
  input.focus();
});

/* =========================================================
   DAILY CHECKLIST (barra vertical verde neon)
   ========================================================= */
function renderDailyPanel(){
  $("#dailyDate").textContent = formatLongDate(todayISO());
  var ul = $("#dailyItems");
  ul.innerHTML = "";
  var items = (state.daily && state.daily.items) || [];
  if (!items.length){
    ul.appendChild(el("li", "daily-empty", "Nenhuma tarefa ainda. Adicione algo pra hoje."));
    return;
  }
  items.forEach(function(item){
    var li = el("li", "daily-item" + (item.done ? " is-done" : ""));
    var circle = el("span", "check-circle" + (item.done ? " done" : ""));
    circle.setAttribute("role", "checkbox");
    circle.setAttribute("aria-checked", String(!!item.done));
    circle.tabIndex = 0;
    circle.addEventListener("click", function(){
      item.done = !item.done;
      saveState();
      renderDailyPanel();
    });
    circle.addEventListener("keydown", function(ev){ if (ev.key === "Enter" || ev.key === " ") circle.click(); });

    var text = el("span", "daily-item-text", escapeHtml(item.text));
    var del = el("span", "daily-item-del");
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    del.addEventListener("click", function(){
      state.daily.items = state.daily.items.filter(function(i){ return i !== item; });
      saveState();
      renderDailyPanel();
    });

    li.appendChild(circle); li.appendChild(text); li.appendChild(del);
    ul.appendChild(li);
  });
}
$("#dailyAddForm").addEventListener("submit", function(ev){
  ev.preventDefault();
  var input = $("#dailyNewItem");
  var text = input.value.trim();
  if (!text) return;
  if (!state.daily) state.daily = { date: todayISO(), items: [] };
  state.daily.items.push({ id: uid(), text: text, done: false });
  saveState();
  input.value = "";
  renderDailyPanel();
  input.focus();
});

var DAILY_OPEN_KEY = "zenlist_daily_open";
function setDailyOpen(open){
  document.body.classList.toggle("daily-open", open);
  try{ localStorage.setItem(DAILY_OPEN_KEY, open ? "1" : "0"); }catch(e){}
  $("#dailyScrim").hidden = !open;
}
$("#btnToggleDaily").addEventListener("click", function(){
  setDailyOpen(!document.body.classList.contains("daily-open"));
});
$("#btnCloseDaily").addEventListener("click", function(){ setDailyOpen(false); });
$("#dailyScrim").addEventListener("click", function(){ setDailyOpen(false); });
(function initDailyOpen(){
  var saved = "0";
  try{ saved = localStorage.getItem(DAILY_OPEN_KEY) || "0"; }catch(e){}
  setDailyOpen(saved === "1");
})();

/* =========================================================
   POPUP: ENTREGAS DE HOJE
   ========================================================= */
function showDueTodayNotification(){
  var today = todayISO();
  var matches = [];
  state.projects.forEach(function(p){
    p.cards.forEach(function(c){
      if (c.due === today) matches.push({ card:c, project:p });
    });
  });
  var popup = $("#dueTodayPopup");
  if (!matches.length){ popup.hidden = true; return false; }

  var list = $("#dueTodayList");
  list.innerHTML = "";
  matches.forEach(function(m){
    var li = el("li", "due-today-item");
    li.appendChild(el("span", "due-today-item-title", escapeHtml(m.card.title)));
    li.appendChild(el("span", "due-today-item-project", escapeHtml(m.project.name)));
    li.addEventListener("click", function(){
      state.activeProjectId = m.project.id;
      saveState();
      renderAll();
      popup.hidden = true;
      openCardModal(m.project, m.card.columnId, m.card.id);
    });
    list.appendChild(li);
  });
  popup.hidden = false;
  return true;
}
$("#btnCloseDueToday").addEventListener("click", function(){ $("#dueTodayPopup").hidden = true; });

$("#btnSaveCard").addEventListener("click", function(){
  var title = $("#cardTitle").value.trim();
  if (!title){ toast("Dê um título ao card."); $("#cardTitle").focus(); return; }
  var data = {
    title: title,
    desc: $("#cardDesc").value,
    due: $("#cardDue").value,
    color: $("#colorSwatches").dataset.selected || "slate",
    checklist: cardModalCtx.checklist
  };
  if (cardModalCtx.cardId){
    updateCard(cardModalCtx.project, cardModalCtx.cardId, data);
  } else {
    addCard(cardModalCtx.project, cardModalCtx.columnId, data);
  }
  closeCardModal();
  renderBoard();
});
$("#btnCancelCard").addEventListener("click", closeCardModal);
$("#cardModalClose").addEventListener("click", closeCardModal);
$("#btnDeleteCard").addEventListener("click", function(){
  if (cardModalCtx.cardId && confirm("Excluir este card?")){
    deleteCard(cardModalCtx.project, cardModalCtx.cardId);
    closeCardModal();
    renderBoard();
  }
});

/* =========================================================
   MODAL: PROMPT (project / column create/rename)
   ========================================================= */
var promptCtx = { type:null, project:null, columnId:null };

function openProjectPromptNew(){
  closeStickerTray();
  promptCtx = { type:"project-new" };
  $("#promptModalTitle").textContent = "Novo projeto";
  $("#promptFieldLabel").textContent = "Nome do projeto";
  $("#promptInput").value = "";
  $("#promptSwatchesWrap").hidden = false;
  renderColorSwatches($("#promptSwatches"), "violet");
  $("#btnPromptDelete").hidden = true;
  $("#promptModal").hidden = false;
  setTimeout(function(){ $("#promptInput").focus(); }, 30);
}
function openProjectPrompt(project){
  closeStickerTray();
  promptCtx = { type:"project-edit", project:project };
  $("#promptModalTitle").textContent = "Editar projeto";
  $("#promptFieldLabel").textContent = "Nome do projeto";
  $("#promptInput").value = project.name;
  $("#promptSwatchesWrap").hidden = false;
  renderColorSwatches($("#promptSwatches"), project.color);
  $("#btnPromptDelete").hidden = false;
  $("#promptModal").hidden = false;
  setTimeout(function(){ $("#promptInput").focus(); }, 30);
}
function openColumnPrompt(project, columnId){
  closeStickerTray();
  var col = columnId ? project.columns.find(function(c){ return c.id === columnId; }) : null;
  promptCtx = { type: col ? "column-edit" : "column-new", project:project, columnId: columnId };
  $("#promptModalTitle").textContent = col ? "Renomear coluna" : "Nova coluna";
  $("#promptFieldLabel").textContent = "Nome da coluna";
  $("#promptInput").value = col ? col.name : "";
  $("#promptSwatchesWrap").hidden = true;
  $("#btnPromptDelete").hidden = true;
  $("#promptModal").hidden = false;
  setTimeout(function(){ $("#promptInput").focus(); }, 30);
}
function closePromptModal(){ $("#promptModal").hidden = true; }

$("#promptModalClose").addEventListener("click", closePromptModal);
$("#btnPromptCancel").addEventListener("click", closePromptModal);
$("#promptInput").addEventListener("keydown", function(ev){
  if (ev.key === "Enter"){ ev.preventDefault(); $("#btnPromptSave").click(); }
});
$("#btnPromptSave").addEventListener("click", function(){
  var val = $("#promptInput").value.trim();
  if (!val){ toast("Digite um nome."); return; }
  if (promptCtx.type === "project-new"){
    createProject(val, $("#promptSwatches").dataset.selected);
    renderAll();
  } else if (promptCtx.type === "project-edit"){
    renameProject(promptCtx.project.id, val);
    recolorProject(promptCtx.project.id, $("#promptSwatches").dataset.selected);
    renderAll();
  } else if (promptCtx.type === "column-new"){
    addColumn(promptCtx.project, val);
    renderBoard();
  } else if (promptCtx.type === "column-edit"){
    renameColumn(promptCtx.project, promptCtx.columnId, val);
    renderBoard();
  }
  closePromptModal();
});
$("#btnPromptDelete").addEventListener("click", function(){
  if (promptCtx.type === "project-edit" && confirm('Excluir o projeto "' + promptCtx.project.name + '" e todos os seus cards?')){
    deleteProject(promptCtx.project.id);
    closePromptModal();
    renderAll();
  }
});

/* =========================================================
   STICKER TRAY
   ========================================================= */
function renderStickerTray(){
  var wrap = $("#stickerTrayItems");
  wrap.innerHTML = "";
  STICKERS.forEach(function(s){
    var img = el("img", "sticker-thumb");
    img.src = s.src;
    img.alt = s.label;
    img.title = s.label;
    img.draggable = true;

    img.addEventListener("dragstart", function(ev){
      ev.dataTransfer.setData("application/x-sticker", s.id);
      ev.dataTransfer.setData("text/plain", "sticker:" + s.id);
      ev.dataTransfer.effectAllowed = "copy";
    });
    img.addEventListener("click", function(){
      if (selectedStickerId === s.id){
        selectedStickerId = null;
        img.classList.remove("selected");
        return;
      }
      $all(".sticker-thumb").forEach(function(t){ t.classList.remove("selected"); });
      selectedStickerId = s.id;
      img.classList.add("selected");
      toast("Toque em um card para colar a figurinha.");
    });

    wrap.appendChild(img);
  });
}
$("#btnStickers").addEventListener("click", function(){
  $("#stickerTray").hidden = !$("#stickerTray").hidden;
});
function closeStickerTray(){
  $("#stickerTray").hidden = true;
  selectedStickerId = null;
  $all(".sticker-thumb").forEach(function(t){ t.classList.remove("selected"); });
}
$("#closeStickerTray").addEventListener("click", closeStickerTray);

/* =========================================================
   TOP-LEVEL BUTTONS
   ========================================================= */
$("#btnAddProject").addEventListener("click", openProjectPromptNew);
$("#btnAddProjectEmpty").addEventListener("click", openProjectPromptNew);
$("#btnAddProjectMain").addEventListener("click", openProjectPromptNew);

/* Mobile sidebar */
function openMobileSidebar(){
  $("#sidebar").classList.add("open");
  $("#sidebarScrim").hidden = false;
  $("#menuToggle").setAttribute("aria-expanded", "true");
}
function closeMobileSidebar(){
  $("#sidebar").classList.remove("open");
  $("#sidebarScrim").hidden = true;
  $("#menuToggle").setAttribute("aria-expanded", "false");
}
$("#menuToggle").addEventListener("click", function(){
  $("#sidebar").classList.contains("open") ? closeMobileSidebar() : openMobileSidebar();
});
$("#sidebarScrim").addEventListener("click", closeMobileSidebar);

/* Desktop sidebar collapse (mais espaço no quadro) */
var SIDEBAR_COLLAPSE_KEY = "zenlist_sidebar_collapsed";
function setSidebarCollapsed(collapsed){
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  try{ localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0"); }catch(e){}
  $("#btnCollapseSidebar").title = collapsed ? "Mostrar projetos" : "Ocultar projetos";
  $("#btnCollapseSidebar").setAttribute("aria-label", collapsed ? "Mostrar projetos" : "Ocultar projetos");
  $("#btnExpandSidebar").hidden = !collapsed;
}
$("#btnCollapseSidebar").addEventListener("click", function(){
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
});
$("#btnExpandSidebar").addEventListener("click", function(){ setSidebarCollapsed(false); });
(function initSidebarCollapse(){
  var saved = "0";
  try{ saved = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) || "0"; }catch(e){}
  setSidebarCollapsed(saved === "1");
})();

/* Escape closes modals */
document.addEventListener("keydown", function(ev){
  if (ev.key === "Escape"){ closeCardModal(); closePromptModal(); }
});
[$("#cardModal"), $("#promptModal")].forEach(function(overlay){
  overlay.addEventListener("click", function(ev){
    if (ev.target === overlay){ overlay.hidden = true; }
  });
});

/* =========================================================
   RENDER ALL
   ========================================================= */
function renderAll(){
  if (!state.activeProjectId && state.projects.length) state.activeProjectId = state.projects[0].id;
  renderSidebar();
  renderBoard();
}
renderStickerTray();

/* =========================================================
   AUTH (Firebase Authentication — e-mail/senha)
   ========================================================= */
var authMode = "signin";

function showAuthScreen(){
  $("#authScreen").hidden = false;
  $("#app").hidden = true;
}
function hideAuthScreen(){
  $("#authScreen").hidden = true;
  $("#app").hidden = false;
}
function showAuthError(msg){
  var box = $("#authError");
  box.textContent = msg;
  box.hidden = false;
}
function setAuthMode(mode){
  authMode = mode;
  var isSignup = mode === "signup";
  $("#authSubmitBtn").textContent = isSignup ? "Criar conta" : "Entrar";
  $("#authSwitchText").textContent = isSignup ? "Já tem conta?" : "Ainda não tem conta?";
  $("#authSwitchBtn").textContent = isSignup ? "Entrar" : "Criar conta";
  $("#authError").hidden = true;
}
function authErrorMessage(code){
  var map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-disabled": "Esta conta foi desativada.",
    "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente em alguns minutos.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet."
  };
  return map[code] || "Não foi possível continuar. Tente novamente.";
}

$("#authSwitchBtn").addEventListener("click", function(){
  setAuthMode(authMode === "signup" ? "signin" : "signup");
});

$("#authForm").addEventListener("submit", function(ev){
  ev.preventDefault();
  $("#authError").hidden = true;
  if (!auth){
    showAuthError("Firebase não configurado. Edite o arquivo firebase-config.js com as chaves do seu projeto.");
    return;
  }
  var email = $("#authEmail").value.trim();
  var pw = $("#authPassword").value;
  $("#authSubmitBtn").disabled = true;
  var action = authMode === "signup"
    ? auth.createUserWithEmailAndPassword(email, pw)
    : auth.signInWithEmailAndPassword(email, pw);
  action.catch(function(err){
    showAuthError(authErrorMessage(err.code));
  }).then(function(){
    $("#authSubmitBtn").disabled = false;
  });
});

$("#authForgotBtn").addEventListener("click", function(){
  var email = $("#authEmail").value.trim();
  if (!email){ showAuthError("Digite seu e-mail acima para recuperar a senha."); return; }
  if (!auth){ showAuthError("Firebase não configurado."); return; }
  auth.sendPasswordResetEmail(email).then(function(){
    toast("Enviamos um link de redefinição de senha para " + email + ".");
  }).catch(function(err){
    showAuthError(authErrorMessage(err.code));
  });
});

$("#btnAccount").addEventListener("click", function(){
  if (!auth || !auth.currentUser) return;
  if (confirm("Sair da conta " + auth.currentUser.email + "?")){
    auth.signOut();
  }
});

function waitForFirebaseSdk(maxWaitMs){
  return new Promise(function(resolve){
    var waited = 0;
    var step = 100;
    (function check(){
      if (window.firebase){ resolve(true); return; }
      waited += step;
      if (waited >= maxWaitMs){ resolve(false); return; }
      setTimeout(check, step);
    })();
  });
}

waitForFirebaseSdk(4000).then(function(sdkLoaded){
  if (sdkLoaded && initFirebase()){
    auth.onAuthStateChanged(function(user){
      if (user){
        currentUid = user.uid;
        $("#btnAccount").title = "Conta: " + user.email;
        hideAuthScreen();
        setupFirestoreSync(user.uid);
      } else {
        currentUid = null;
        if (unsubscribeSnapshot){ unsubscribeSnapshot(); unsubscribeSnapshot = null; }
        state = { projects: [], activeProjectId: null };
        showAuthScreen();
      }
    });
  } else if (!sdkLoaded){
    showAuthError("Não foi possível carregar o Firebase (gstatic.com). Verifique sua conexão, ou se algum bloqueador de anúncios/antivírus/extensão de privacidade está bloqueando o carregamento, e recarregue a página.");
  } else {
    showAuthError("Firebase não configurado. Edite o arquivo firebase-config.js com as chaves do seu projeto (veja as instruções nos comentários do arquivo).");
  }
});

/* =========================================================
   PWA: install prompt + service worker
   ========================================================= */
var deferredInstall = null;
window.addEventListener("beforeinstallprompt", function(ev){
  ev.preventDefault();
  deferredInstall = ev;
  $("#btnInstall").hidden = false;
});
$("#btnInstall").addEventListener("click", function(){
  if (!deferredInstall) return;
  deferredInstall.prompt();
  deferredInstall.userChoice.then(function(){ $("#btnInstall").hidden = true; deferredInstall = null; });
});
window.addEventListener("appinstalled", function(){ $("#btnInstall").hidden = true; toast("App instalado."); });

if ("serviceWorker" in navigator){
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").catch(function(err){
      console.warn("Falha ao registrar service worker", err);
    });
  });
}

})();
