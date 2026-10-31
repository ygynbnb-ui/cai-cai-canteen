/**
 * ============================================================
 *  「财财今天吃点啥？」交互逻辑
 * ============================================================
 *
 *  想改菜名、价格：只需要编辑 js/foods.js。
 *  这个文件负责：选择食堂、随机抽菜、结果动画、按钮交互。
 * ============================================================
 */

(function () {
  "use strict";

  var RESTAURANTS = ["一餐二楼", "二餐一楼", "二餐二楼"];
  var ALL_SCOPE = "全部随机";
  var RECENT_LIMIT = 3;
  var ROLL_DURATION = 720;
  var $ = function (id) {
    return document.getElementById(id);
  };

  var state = {
    selectedScope: ALL_SCOPE,
    recentKeys: [],
    lastPickKey: null,
    isOpen: false,
    isRolling: false,
    lastFocusedElement: null,
    rollIntervalId: null,
    rollTimeoutId: null,
    closeTimeoutId: null,
    focusTimeoutId: null,
    emptyFocusTimeoutId: null,
    confettiTimeoutId: null
  };

  var menu = {};
  var elements = {};
  var reduceMotionQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  var RESULT_TIPS = [
    "别纠结啦，今天就是它。",
    "命运已经替你尝过一口。",
    "就它了，吃饱才有力气征服世界。",
    "今天的快乐，从这顿饭开始。",
    "每一次翻牌，都是一场命中注定。"
  ];

  /* ------------------------------------------------------------
   * 初始化
   * ---------------------------------------------------------- */

  function init() {
    cacheElements();
    menu = normalizeMenu(window.FOOD_DATA);
    updateDateLabel();
    applyMenuCounts();
    applySelectionUI();
    bindEvents();
  }

  function cacheElements() {
    elements.app = document.querySelector(".app");
    elements.actionDock = document.querySelector(".action-dock");
    elements.placeCards = Array.prototype.slice.call(
      document.querySelectorAll(".place-card")
    );
    elements.chooser = document.querySelector(".chooser");
    elements.placeGrid = document.querySelector(".place-grid");
    elements.dateLabel = $("dateLabel");
    elements.selectedBadge = $("selectedBadge");
    elements.chooserNote = $("chooserNote");
    elements.dockScope = $("dockScope");
    elements.dockCount = $("dockCount");
    elements.randomBtn = $("randomBtn");

    elements.overlay = $("resultOverlay");
    elements.confettiLayer = $("confettiLayer");
    elements.sheet = $("resultSheet");
    elements.closeButton = $("closeResult");
    elements.resultView = $("resultView");
    elements.emptyView = $("emptyView");
    elements.resultPanel = $("resultPanel");
    elements.resultBadge = $("resultBadge");
    elements.resultRestaurant = $("resultRestaurant");
    elements.resultName = $("resultName");
    elements.resultPrice = $("resultPrice");
    elements.resultTip = $("resultTip");
    elements.rerollBtn = $("rerollBtn");
    elements.rerollLabel = elements.rerollBtn.querySelector("span");
    elements.reselectBtn = $("reselectBtn");
    elements.emptyTitle = $("emptyTitle");
    elements.emptyText = $("emptyText");
    elements.emptyChoose = $("emptyChoose");
    elements.dialogHeading = $("dialogHeading");
    elements.liveStatus = $("liveStatus");
  }

  function bindEvents() {
    elements.placeGrid.addEventListener("click", function (event) {
      var target = event.target;
      var card =
        target && target.closest ? target.closest(".place-card") : null;

      if (!card || !elements.placeGrid.contains(card)) {
        return;
      }

      selectScope(card.getAttribute("data-scope"));
    });

    elements.randomBtn.addEventListener("click", handleMainAction);
    elements.rerollBtn.addEventListener("click", handleReroll);
    elements.reselectBtn.addEventListener("click", function () {
      closeDialog({ returnToChooser: true });
    });
    elements.emptyChoose.addEventListener("click", function () {
      closeDialog({ returnToChooser: true });
    });
    elements.closeButton.addEventListener("click", function () {
      closeDialog();
    });

    elements.overlay.addEventListener("click", function (event) {
      if (event.target === elements.overlay) {
        closeDialog();
      }
    });

    elements.overlay.addEventListener("keydown", handleDialogKeydown);
  }

  /* ------------------------------------------------------------
   * 菜品数据整理
   * ---------------------------------------------------------- */

  function normalizeMenu(rawData) {
    var normalized = {};

    RESTAURANTS.forEach(function (restaurant) {
      normalized[restaurant] = [];
    });

    if (!Array.isArray(rawData)) {
      console.warn(
        "[财财今天吃点啥] 没有读取到 FOOD_DATA，请检查 js/foods.js 是否正常加载。"
      );
      return normalized;
    }

    rawData.forEach(function (group) {
      if (!group || typeof group.restaurant !== "string") {
        return;
      }

      var restaurant = group.restaurant.trim();

      if (RESTAURANTS.indexOf(restaurant) === -1) {
        console.warn(
          "[财财今天吃点啥] 出现了未知的餐厅名称：" + restaurant + "，已跳过。"
        );
        return;
      }

      if (!Array.isArray(group.foods)) {
        return;
      }

      group.foods.forEach(function (food) {
        if (!food || typeof food.name !== "string" || !food.name.trim()) {
          return;
        }

        var price = Number(food.price);
        if (!isFinite(price) || price < 0) {
          price = null;
        }

        var name = food.name.trim();

        normalized[restaurant].push({
          name: name,
          price: price,
          restaurant: restaurant,
          key: restaurant + "::" + name
        });
      });
    });

    return normalized;
  }

  function getFoodsByScope(scope) {
    if (scope === ALL_SCOPE) {
      var allFoods = [];

      RESTAURANTS.forEach(function (restaurant) {
        allFoods = allFoods.concat(menu[restaurant] || []);
      });

      return allFoods;
    }

    return (menu[scope] || []).slice();
  }

  /* ------------------------------------------------------------
   * 页面状态
   * ---------------------------------------------------------- */

  function updateDateLabel() {
    var weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    var now = new Date();

    elements.dateLabel.textContent =
      now.getMonth() + 1 + "月" + now.getDate() + "日 · " + weekdays[now.getDay()];
  }

  function applyMenuCounts() {
    elements.placeCards.forEach(function (card) {
      var scope = card.getAttribute("data-scope");
      var count = getFoodsByScope(scope).length;
      var meta = card.querySelector("[data-count]");

      if (count > 0) {
        meta.textContent = count + " 道菜品";
        card.classList.remove("is-empty");
      } else {
        meta.textContent = "暂未上新";
        card.classList.add("is-empty");
      }
    });
  }

  function applySelectionUI() {
    var count = getFoodsByScope(state.selectedScope).length;
    var note;

    elements.placeCards.forEach(function (card) {
      var isSelected = card.getAttribute("data-scope") === state.selectedScope;
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });

    elements.selectedBadge.textContent = state.selectedScope;
    elements.dockScope.textContent = state.selectedScope;
    elements.dockCount.textContent = count;

    if (count === 0) {
      if (state.selectedScope === ALL_SCOPE) {
        note = "菜单还在准备中，等有新菜再来翻牌吧。";
      } else {
        note =
          "「" +
          state.selectedScope +
          "」还没有录入菜品，先看看其他食堂吧。";
      }
    } else if (state.selectedScope === ALL_SCOPE) {
      note = "三个食堂共 " + count + " 道菜，随机翻一张。";
    } else {
      note =
        "只从「" +
        state.selectedScope +
        "」的 " +
        count +
        " 道菜里挑选。";
    }

    elements.chooserNote.textContent = note;
    elements.chooserNote.classList.toggle("is-warn", count === 0);
  }

  function selectScope(scope) {
    if (
      scope !== ALL_SCOPE &&
      RESTAURANTS.indexOf(scope) === -1
    ) {
      return;
    }

    state.selectedScope = scope;
    applySelectionUI();
    haptic(6);
  }

  /* ------------------------------------------------------------
   * 随机抽取
   * ---------------------------------------------------------- */

  function pickRandomFood(pool) {
    if (!pool.length) {
      return null;
    }

    // 先避开最近抽到过的菜；实在避不开，再只避开上一道。
    // 只有一个菜时才会出现无法避开的情况。
    var freshPool = pool.filter(function (food) {
      return state.recentKeys.indexOf(food.key) === -1;
    });

    if (!freshPool.length) {
      freshPool = pool.filter(function (food) {
        return food.key !== state.lastPickKey;
      });
    }

    if (!freshPool.length) {
      freshPool = pool;
    }

    var picked = freshPool[Math.floor(Math.random() * freshPool.length)];

    state.recentKeys.unshift(picked.key);
    if (state.recentKeys.length > RECENT_LIMIT) {
      state.recentKeys.length = RECENT_LIMIT;
    }
    state.lastPickKey = picked.key;

    return picked;
  }

  function formatPrice(price) {
    if (price === null || price === undefined) {
      return "参考价待定";
    }

    var priceText = Number.isInteger(price) ? String(price) : price.toFixed(1);
    return "参考价 ¥" + priceText;
  }

  /* ------------------------------------------------------------
   * 主按钮与结果弹层
   * ---------------------------------------------------------- */

  function handleMainAction() {
    if (state.isRolling) {
      return;
    }

    var pool = getFoodsByScope(state.selectedScope);

    state.lastFocusedElement = elements.randomBtn;
    haptic(10);

    if (!pool.length) {
      showEmptyDialog();
      return;
    }

    elements.resultView.hidden = false;
    elements.emptyView.hidden = true;
    openDialog();
    startRoll(pool);
  }

  function handleReroll() {
    if (!state.isOpen || state.isRolling) {
      return;
    }

    var pool = getFoodsByScope(state.selectedScope);

    if (!pool.length) {
      showEmptyDialog();
      return;
    }

    haptic(8);
    startRoll(pool);
  }

  function openDialog() {
    window.clearTimeout(state.closeTimeoutId);
    window.clearTimeout(state.emptyFocusTimeoutId);
    state.closeTimeoutId = null;
    state.emptyFocusTimeoutId = null;
    state.isOpen = true;

    elements.overlay.hidden = false;
    elements.sheet.scrollTop = 0;
    document.body.classList.add("is-modal-open");
    setBackgroundInert(true);

    // 等浏览器完成一次布局，再加动画类，弹层才会从下方滑入。
    window.requestAnimationFrame(function () {
      elements.overlay.classList.add("is-open");
    });

    window.clearTimeout(state.focusTimeoutId);
    state.focusTimeoutId = window.setTimeout(function () {
      if (state.isOpen) {
        try {
          elements.sheet.focus({ preventScroll: true });
        } catch (error) {
          elements.sheet.focus();
        }
      }
    }, 120);
  }

  function closeDialog(options) {
    if (!state.isOpen) {
      return;
    }

    var shouldReturnToChooser = Boolean(options && options.returnToChooser);

    state.isOpen = false;
    stopRolling();
    clearConfetti();
    window.clearTimeout(state.focusTimeoutId);
    window.clearTimeout(state.emptyFocusTimeoutId);
    elements.overlay.classList.remove("is-open");
    document.body.classList.remove("is-modal-open");

    window.clearTimeout(state.closeTimeoutId);
    state.closeTimeoutId = window.setTimeout(function () {
      if (state.isOpen) {
        return;
      }

      elements.overlay.hidden = true;
      setBackgroundInert(false);

      if (shouldReturnToChooser) {
        if (elements.chooser) {
          try {
            elements.chooser.scrollIntoView({
              behavior: prefersReducedMotion() ? "auto" : "smooth",
              block: "center"
            });
          } catch (error) {
            elements.chooser.scrollIntoView();
          }
        }

        var selectedCard = elements.placeCards.find(function (card) {
          return card.getAttribute("aria-pressed") === "true";
        });

        if (selectedCard) {
          window.setTimeout(function () {
            if (!state.isOpen) {
              try {
                selectedCard.focus({ preventScroll: true });
              } catch (error) {
                selectedCard.focus();
              }
            }
          }, 280);
        }
      } else if (
        state.lastFocusedElement &&
        document.contains(state.lastFocusedElement)
      ) {
        try {
          state.lastFocusedElement.focus({ preventScroll: true });
        } catch (error) {
          state.lastFocusedElement.focus();
        }
      }
    }, 300);
  }

  function showEmptyDialog() {
    var totalCount = getFoodsByScope(ALL_SCOPE).length;

    if (state.selectedScope === ALL_SCOPE || totalCount === 0) {
      elements.emptyTitle.textContent = "菜单正在准备中";
      elements.emptyText.textContent =
        "三个食堂都还没有录入菜品。等新菜单上线，再来让财财帮你选吧。";
    } else {
      elements.emptyTitle.textContent = "这个食堂还没上新";
      elements.emptyText.textContent =
        "「" +
        state.selectedScope +
        "」还没有录入菜品，换一个食堂，或者先去别的窗口看看。";
    }

    elements.emptyChoose.textContent =
      totalCount === 0 ? "知道啦" : "换个食堂看看";
    elements.dialogHeading.textContent = "暂无菜品";
    elements.liveStatus.textContent =
      totalCount === 0
        ? "菜单正在准备中，稍后再来吧。"
        : "当前抽餐范围还没有菜品，请换一个食堂。";
    elements.resultView.hidden = true;
    elements.emptyView.hidden = false;

    if (!state.isOpen) {
      openDialog();
    }

    window.clearTimeout(state.emptyFocusTimeoutId);
    state.emptyFocusTimeoutId = window.setTimeout(function () {
      if (state.isOpen && !elements.emptyView.hidden) {
        try {
          elements.emptyChoose.focus({ preventScroll: true });
        } catch (error) {
          elements.emptyChoose.focus();
        }
      }
    }, 320);
  }

  /* ------------------------------------------------------------
   * 抽奖动画
   * ---------------------------------------------------------- */

  function startRoll(pool) {
    var picked = pickRandomFood(pool);

    if (!picked) {
      showEmptyDialog();
      return;
    }

    stopRolling();
    state.isRolling = true;

    elements.resultPanel.classList.remove("is-revealed");
    elements.resultPanel.classList.add("is-rolling");
    elements.resultBadge.textContent = "✦ 翻牌中…";
    elements.resultRestaurant.textContent =
      state.selectedScope === ALL_SCOPE ? "全部随机" : state.selectedScope;
    elements.resultName.textContent = "正在挑选…";
    elements.resultPrice.textContent = "参考价 · 揭晓中";
    elements.resultTip.textContent =
      "正在从 " + pool.length + " 道菜里翻一张…";
    elements.dialogHeading.textContent = "正在为你挑选";
    elements.liveStatus.textContent = "正在为你挑选。";
    elements.rerollBtn.setAttribute("aria-disabled", "true");
    elements.rerollLabel.textContent = "翻牌中…";
    elements.resultView.setAttribute("aria-busy", "true");

    if (prefersReducedMotion()) {
      revealResult(picked);
      return;
    }

    // 名字快速跳动，制造抽奖翻牌的紧张感。
    state.rollIntervalId = window.setInterval(function () {
      var preview = pool[Math.floor(Math.random() * pool.length)];
      elements.resultName.textContent = preview.name;
    }, 62);

    state.rollTimeoutId = window.setTimeout(function () {
      revealResult(picked);
    }, ROLL_DURATION);
  }

  function revealResult(picked) {
    stopRolling();

    elements.resultName.textContent = picked.name;
    elements.resultRestaurant.textContent = picked.restaurant;
    elements.resultPrice.textContent = formatPrice(picked.price);
    elements.resultBadge.textContent = "✦ 今日推荐！";
    elements.resultTip.textContent =
      RESULT_TIPS[Math.floor(Math.random() * RESULT_TIPS.length)];
    elements.resultView.removeAttribute("aria-busy");
    elements.rerollBtn.removeAttribute("aria-disabled");
    elements.rerollLabel.textContent = "再抽一次";
    elements.dialogHeading.textContent = "今日推荐：" + picked.name;

    var announcement =
      "今日推荐：" +
      picked.name +
      "，来自" +
      picked.restaurant +
      (picked.price !== null
        ? "，参考价" + picked.price + "元。"
        : "，价格待定。");
    elements.liveStatus.textContent = announcement;

    // 重新触发一次动画，让每次“再抽一次”都有揭晓感。
    elements.resultPanel.classList.remove("is-revealed");
    void elements.resultPanel.offsetWidth;
    elements.resultPanel.classList.add("is-revealed");

    burstConfetti();
    haptic([12, 36, 18]);
  }

  function stopRolling() {
    window.clearInterval(state.rollIntervalId);
    window.clearTimeout(state.rollTimeoutId);
    state.rollIntervalId = null;
    state.rollTimeoutId = null;
    state.isRolling = false;

    if (elements.resultView) {
      elements.resultView.removeAttribute("aria-busy");
    }
    if (elements.resultPanel) {
      elements.resultPanel.classList.remove("is-rolling");
    }
    if (elements.rerollBtn) {
      elements.rerollBtn.removeAttribute("aria-disabled");
    }
    if (elements.rerollLabel) {
      elements.rerollLabel.textContent = "再抽一次";
    }
  }

  function burstConfetti() {
    if (prefersReducedMotion() || !elements.confettiLayer) {
      return;
    }

    var colors = ["#F3C34F", "#C6DEC6", "#FFF4D0", "#E7B58F", "#7FB69A"];
    elements.confettiLayer.innerHTML = "";
    window.clearTimeout(state.confettiTimeoutId);

    for (var i = 0; i < 24; i += 1) {
      var piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.left = 18 + Math.random() * 64 + "%";
      piece.style.setProperty("--w", (4 + Math.random() * 5).toFixed(1) + "px");
      piece.style.setProperty(
        "--h",
        (7 + Math.random() * 8).toFixed(1) + "px"
      );
      piece.style.setProperty(
        "--drift",
        Math.round(Math.random() * 250 - 125) + "px"
      );
      piece.style.setProperty(
        "--rotate",
        Math.round(Math.random() * 620 - 310) + "deg"
      );
      piece.style.setProperty(
        "--delay",
        (Math.random() * 0.16).toFixed(2) + "s"
      );
      piece.style.setProperty(
        "--duration",
        (0.95 + Math.random() * 0.65).toFixed(2) + "s"
      );
      piece.style.setProperty(
        "--color",
        colors[Math.floor(Math.random() * colors.length)]
      );
      elements.confettiLayer.appendChild(piece);
    }

    state.confettiTimeoutId = window.setTimeout(function () {
      elements.confettiLayer.innerHTML = "";
    }, 1900);
  }

  function clearConfetti() {
    window.clearTimeout(state.confettiTimeoutId);
    state.confettiTimeoutId = null;
    if (elements.confettiLayer) {
      elements.confettiLayer.innerHTML = "";
    }
  }

  /* ------------------------------------------------------------
   * 键盘与辅助功能
   * ---------------------------------------------------------- */

  function handleDialogKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    var focusable = Array.prototype.slice
      .call(
        elements.sheet.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (element) {
        return element.offsetParent !== null;
      });

    if (!focusable.length) {
      event.preventDefault();
      elements.sheet.focus();
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var active = document.activeElement;

    if (event.shiftKey && (active === first || active === elements.sheet)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setBackgroundInert(isInert) {
    [elements.app, elements.actionDock].forEach(function (element) {
      if (!element) {
        return;
      }

      if (isInert) {
        element.setAttribute("inert", "");
      } else {
        element.removeAttribute("inert");
      }
    });
  }

  function haptic(pattern) {
    if (typeof navigator.vibrate !== "function") {
      return;
    }

    try {
      navigator.vibrate(pattern);
    } catch (error) {
      // 部分浏览器不支持震动，忽略即可。
    }
  }

  function prefersReducedMotion() {
    return Boolean(reduceMotionQuery && reduceMotionQuery.matches);
  }

  /* ------------------------------------------------------------
   * 启动
   * ---------------------------------------------------------- */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
