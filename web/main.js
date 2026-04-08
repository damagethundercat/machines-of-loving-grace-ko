const MANUSCRIPT_URL = "./data/manuscript.json";
const reader = document.getElementById("reader");
const pageTrack = document.getElementById("page-track");
const contentsPanel = document.getElementById("contents-panel");
const contentsHomeLink = document.getElementById("contents-home-link");
const pageSlider = document.getElementById("page-slider");
const pageCounter = document.getElementById("page-counter");
const notePreview = document.getElementById("note-preview");
const typeScaleControls = document.getElementById("type-scale-controls");
const graphemeSegmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
const measurementCache = new Map();
let measureContext = null;
const COVER_AUTHOR = "다리오 아모데이";
const TYPE_SCALE_STORAGE_KEY = "machines-of-loving-grace:type-scale";
const TYPE_SCALE_PRESETS = {
  small: 0.92,
  medium: 1,
  large: 1.1,
};
const INLINE_NOTE_RIGHT_INSET = 28;
const COVER_MAIN_PANEL_RATIO = 724 / 960;
const COVER_TOP_PANEL_RATIO = 294 / 635;
const COVER_RIGHT_PANEL_RATIO = 1333 / 637;
const COVER_SIDE_STACK_RATIO = COVER_TOP_PANEL_RATIO + COVER_RIGHT_PANEL_RATIO;

const NOTE_PREVIEW_OVERRIDES = new Map([
  [
    1,
    {
      kind: "poem",
      label: "1. 원제의 출처가 된 시",
      title: "All Watched Over By Machines Of Loving Grace",
      author: "Richard Brautigan",
      stanzas: [
        [
          "나는 생각하고 싶다",
          "(빠르면 빠를수록 좋다!)",
          "포유류와 컴퓨터가",
          "서로를 프로그래밍하는 조화 속에서",
          "함께 살아가는",
          "사이버네틱 초원을,",
          "마치 맑은 물이",
          "맑은 하늘에 닿듯.",
        ],
        [
          "나는 생각하고 싶다",
          "(지금 당장이라도!)",
          "소나무와 전자 장치들로 가득한",
          "사이버네틱 숲을,",
          "그곳에서 사슴들이",
          "컴퓨터 곁을 평화롭게 거닐고,",
          "그것들을",
          "빙글도는 꽃잎을 단 꽃인 양",
          "여기는 모습을.",
        ],
        [
          "나는 생각하고 싶다",
          "(꼭 그래야만 한다!)",
          "우리가 노동에서 벗어나",
          "자연과 다시 이어지고,",
          "우리의 포유류 형제자매들에게로 돌아가,",
          "사랑의 은총을 지닌 기계들이",
          "우리를 지켜보는",
          "사이버네틱 생태계를.",
        ],
      ],
      source: {
        text: "원문 보기",
        href: "https://allpoetry.com/All-Watched-Over-By-Machines-Of-Loving-Grace",
      },
    },
  ],
]);

const state = {
  manuscript: null,
  metrics: null,
  pages: [],
  notePages: new Map(),
  noteRefPages: new Map(),
  endnotes: new Map(),
  sectionPages: [],
  currentPage: 0,
  isSliderScrubbing: false,
  sliderScale: 100,
  resizeTimer: 0,
  scrollRaf: 0,
  wheelLockedUntil: 0,
  pendingPage: null,
  pendingScrollLeft: null,
  pendingPageTimer: 0,
  activeNoteNumber: null,
  pinnedNoteNumber: null,
  notePreviewHideTimer: 0,
  typeScale: "medium",
  layoutUpdateRaf: 0,
  coverLayoutRaf: 0,
};

init().catch((error) => {
  console.error(error);
  showError("리더를 초기화하지 못했습니다.");
});

async function init() {
  state.manuscript = await fetchJson(MANUSCRIPT_URL);
  state.typeScale = loadStoredTypeScale();
  await waitForFonts();
  installEventHandlers();
  updateTypeScaleControls();
  repaginate({ preserveHash: true });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

async function waitForFonts() {
  if (!document.fonts) {
    return;
  }

  try {
    await Promise.all([
      document.fonts.load('400 20px "Noto Serif KR"'),
      document.fonts.load('600 30px "Noto Serif KR"'),
      document.fonts.load('400 15px "Noto Sans KR"'),
    ]);
    await document.fonts.ready;
  } catch (error) {
    console.warn("Font loading failed; continuing anyway.", error);
  }
}

function installEventHandlers() {
  reader.addEventListener("click", onReaderClick);
  reader.addEventListener("pointerover", onReaderPointerOver);
  reader.addEventListener("pointerout", onReaderPointerOut);
  reader.addEventListener("mouseover", onReaderPointerOver);
  reader.addEventListener("mouseout", onReaderPointerOut);
  reader.addEventListener("wheel", onReaderWheel, { passive: false });
  reader.addEventListener("scroll", onReaderScroll, { passive: true });
  contentsPanel?.addEventListener("click", onContentsClick);
  contentsHomeLink?.addEventListener("click", onContentsHomeClick);
  pageSlider?.addEventListener("input", onPageSliderInput);
  pageSlider?.addEventListener("pointerdown", onPageSliderPointerDown);
  pageSlider?.addEventListener("pointerup", onPageSliderPointerUp);
  pageSlider?.addEventListener("pointercancel", onPageSliderPointerUp);
  pageSlider?.addEventListener("blur", onPageSliderPointerUp);
  pageSlider?.addEventListener("wheel", onPageSliderWheel, { passive: false });
  notePreview?.addEventListener("pointerenter", onNotePreviewPointerEnter);
  notePreview?.addEventListener("pointerleave", onNotePreviewPointerLeave);
  notePreview?.addEventListener("mouseenter", onNotePreviewPointerEnter);
  notePreview?.addEventListener("mouseleave", onNotePreviewPointerLeave);
  typeScaleControls?.addEventListener("click", onTypeScaleControlsClick);

  document.addEventListener("pointerdown", onDocumentPointerDown);
  window.addEventListener("resize", onResize);
  window.addEventListener("hashchange", onHashChange);
  document.addEventListener("keydown", onKeyDown);
}

function onTypeScaleControlsClick(event) {
  const button = event.target.closest("button[data-type-scale]");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const nextScale = button.dataset.typeScale;
  if (!isValidTypeScale(nextScale) || nextScale === state.typeScale) {
    return;
  }

  state.typeScale = nextScale;
  persistTypeScale(nextScale);
  updateTypeScaleControls();
  closeNotePreview();
  repaginate({ preserveCurrentLocator: true, suppressVisualJump: true });
}

function isValidTypeScale(value) {
  return typeof value === "string" && value in TYPE_SCALE_PRESETS;
}

function loadStoredTypeScale() {
  try {
    const stored = window.localStorage.getItem(TYPE_SCALE_STORAGE_KEY);
    return isValidTypeScale(stored) ? stored : "medium";
  } catch (error) {
    return "medium";
  }
}

function persistTypeScale(typeScale) {
  try {
    window.localStorage.setItem(TYPE_SCALE_STORAGE_KEY, typeScale);
  } catch (error) {
    // Ignore persistence failures and keep the current in-memory preference.
  }
}

function updateTypeScaleControls() {
  if (!typeScaleControls) {
    return;
  }
  const buttons = typeScaleControls.querySelectorAll("button[data-type-scale]");
  buttons.forEach((button) => {
    const isActive = button.dataset.typeScale === state.typeScale;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function getTypeScaleMultiplier() {
  return TYPE_SCALE_PRESETS[state.typeScale] ?? TYPE_SCALE_PRESETS.medium;
}

function onReaderClick(event) {
  const anchor = event.target.closest("a");
  if (anchor) {
    if (anchor.classList.contains("note-ref") && tryToggleInlineNotePin(anchor, event)) {
      return;
    }
    const pageLink = anchor.dataset.pageLink;
    if (pageLink) {
      event.preventDefault();
      goToPage(Number(pageLink), { behavior: "smooth", updateHash: true });
    }
    return;
  }

  const rect = reader.getBoundingClientRect();
  const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
  if (x < 0.2) {
    goToPage(state.currentPage - 1, { behavior: "smooth", updateHash: true });
    return;
  }
  if (x > 0.8) {
    goToPage(state.currentPage + 1, { behavior: "smooth", updateHash: true });
  }
}

function onReaderPointerOver(event) {
  const anchor = event.target.closest("a.note-ref");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return;
  }
  if (state.pinnedNoteNumber != null) {
    return;
  }

  const noteNumber = Number(anchor.dataset.noteNumber);
  if (!Number.isFinite(noteNumber) || !hasInlineNotePreviewContent(noteNumber)) {
    return;
  }
  if (!shouldUseInlineNotePreview() && !shouldUseCoverStructureNotePreview(noteNumber)) {
    return;
  }

  clearNotePreviewHideTimer();
  openNotePreview(noteNumber, anchor, { pinned: false });
}

function onReaderPointerOut(event) {
  const anchor = event.target.closest("a.note-ref");
  if (!(anchor instanceof HTMLAnchorElement) || state.pinnedNoteNumber != null) {
    return;
  }
  scheduleNotePreviewClose();
}

function onContentsClick(event) {
  const anchor = event.target.closest("a[data-page-link]");
  if (!anchor) {
    return;
  }
  event.preventDefault();
  goToPage(Number(anchor.dataset.pageLink), { behavior: "smooth", updateHash: true });
}

function onContentsHomeClick(event) {
  const anchor = event.currentTarget;
  if (!(anchor instanceof HTMLAnchorElement)) {
    return;
  }
  event.preventDefault();
  goToPage(Number(anchor.dataset.pageLink), { behavior: "smooth", updateHash: true });
}

function onPageSliderInput(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const fraction = getSliderFraction(target);
  if (!state.isSliderScrubbing) {
    const targetPage = Math.round(fraction * Math.max(state.pages.length - 1, 0));
    goToPage(targetPage, { behavior: "auto", updateHash: true });
    return;
  }

  scrubReaderToFraction(fraction);
}

function onPageSliderPointerDown(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  clearPendingPageTurn();
  closeNotePreview();
  if (typeof target.setPointerCapture === "function") {
    target.setPointerCapture(event.pointerId);
  }
  state.isSliderScrubbing = true;
  reader.classList.add("is-slider-scrubbing");
  target.classList.add("is-dragging");
}

function onPageSliderPointerUp(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const pointerId = "pointerId" in event ? event.pointerId : null;
  if (
    typeof pointerId === "number" &&
    typeof target.releasePointerCapture === "function" &&
    target.hasPointerCapture?.(pointerId)
  ) {
    target.releasePointerCapture(pointerId);
  }
  target.classList.remove("is-dragging");
  if (!state.isSliderScrubbing) {
    return;
  }

  state.isSliderScrubbing = false;
  reader.classList.remove("is-slider-scrubbing");
  const targetPage = resolveNearestPageIndex();
  goToPage(targetPage, { behavior: "auto", updateHash: true });
}

function onPageSliderWheel(event) {
  event.preventDefault();
  event.stopPropagation();
}

function onReaderWheel(event) {
  if (event.target.closest("a")) {
    return;
  }

  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

  if (Math.abs(delta) < 28) {
    return;
  }

  const now = Date.now();
  if (now < state.wheelLockedUntil) {
    event.preventDefault();
    return;
  }

  state.wheelLockedUntil = now + 450;
  event.preventDefault();
  goToPage(state.currentPage + (delta > 0 ? 1 : -1), {
    behavior: "smooth",
    updateHash: true,
  });
}

function onReaderScroll() {
  if (reader.classList.contains("is-layout-updating")) {
    return;
  }
  if (state.scrollRaf) {
    return;
  }
  state.scrollRaf = window.requestAnimationFrame(() => {
    state.scrollRaf = 0;
    syncCurrentPageFromScroll();
  });
}

function onResize() {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = window.setTimeout(() => {
    repaginate({ preserveCurrentLocator: true });
  }, 120);
}

function onHashChange() {
  const targetPage = parseHashPage(window.location.hash, state.pages.length);
  goToPage(targetPage, { behavior: "smooth", updateHash: false });
}

function onDocumentPointerDown(event) {
  if (!(event.target instanceof Element)) {
    return;
  }
  if (event.target.closest(".note-preview, .note-ref, .type-scale-controls")) {
    return;
  }
  closeNotePreview();
}

function onNotePreviewPointerEnter() {
  clearNotePreviewHideTimer();
}

function onNotePreviewPointerLeave() {
  if (state.pinnedNoteNumber != null) {
    return;
  }
  scheduleNotePreviewClose();
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  if (event.key === "Escape" && state.activeNoteNumber != null) {
    event.preventDefault();
    closeNotePreview();
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    goToPage(state.currentPage - 1, { behavior: "smooth", updateHash: true });
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    goToPage(state.currentPage + 1, { behavior: "smooth", updateHash: true });
  }
}

function repaginate(options = {}) {
  if (!state.manuscript) {
    return;
  }

  clearPendingPageTurn();
  closeNotePreview();
  if (options.suppressVisualJump) {
    beginLayoutUpdate();
  }

  const currentLocator = options.preserveCurrentLocator
    ? rememberCurrentLocator()
    : null;
  const metrics = computeMetrics();
  state.metrics = metrics;
  applyMetrics(metrics);

  const paginated = paginate(state.manuscript, metrics);
  state.pages = paginated.pages;
  state.notePages = paginated.notePages;
  state.noteRefPages = paginated.noteRefPages;
  state.endnotes = collectEndnotes(state.manuscript);
  state.sectionPages = paginated.sectionPages;

  renderPages();
  renderContents();

  let targetPage = 0;
  if (options.preserveHash) {
    targetPage = parseHashPage(window.location.hash, state.pages.length);
  } else if (currentLocator) {
    targetPage = resolveLocatorToPage(currentLocator);
  }

  if (options.suppressVisualJump) {
    goToPageWithoutMotion(targetPage, { updateHash: true, closePreview: false });
  } else {
    goToPage(targetPage, { behavior: "auto", updateHash: true });
  }
  if (options.suppressVisualJump) {
    finishLayoutUpdate();
  }
}

function beginLayoutUpdate() {
  if (!reader) {
    return;
  }
  if (state.layoutUpdateRaf) {
    window.cancelAnimationFrame(state.layoutUpdateRaf);
    state.layoutUpdateRaf = 0;
  }
  reader.classList.add("is-layout-updating");
}

function finishLayoutUpdate() {
  if (!reader) {
    return;
  }
  if (state.layoutUpdateRaf) {
    window.cancelAnimationFrame(state.layoutUpdateRaf);
  }
  state.layoutUpdateRaf = window.requestAnimationFrame(() => {
    state.layoutUpdateRaf = window.requestAnimationFrame(() => {
      reader.classList.remove("is-layout-updating");
      syncCurrentPageFromScroll();
      state.layoutUpdateRaf = 0;
    });
  });
}

function computeMetrics() {
  const readerWidth = reader.clientWidth || window.innerWidth;
  const readerHeight = reader.clientHeight || window.innerHeight;
  const typeScale = getTypeScaleMultiplier();
  const isPhone = readerWidth < 480;
  const isCompact = readerWidth < 720;
  const shellPaddingY = isCompact ? (isPhone ? 8 : 10) : 18;
  const pagePaddingY = isPhone ? 28 : isCompact ? 40 : 64;
  const bottomUiReserve = isPhone
    ? 120
    : isCompact
      ? 96
      : readerWidth < 1180
        ? 92
        : readerWidth < 1600
          ? 76
          : 64;
  const columnInset = isPhone ? 16 : isCompact ? 28 : 32;
  const viewportSafetyInset = isPhone
    ? 36
    : isCompact
      ? 14
      : readerWidth < 1180
        ? 18
        : readerWidth < 1400
          ? 10
          : readerWidth < 1800
            ? 0
            : 18;
  const maxColumnWidth = isCompact
    ? readerWidth - columnInset
    : readerWidth < 1180
      ? 664
      : readerWidth < 1400
        ? 700
        : readerWidth < 1700
          ? 736
          : 760;
  const columnWidth = Math.min(
    readerWidth - columnInset,
    maxColumnWidth,
  ) - viewportSafetyInset;
  const textLayoutSafetyInset = isPhone
    ? 0
    : isCompact
      ? 0
      : readerWidth < 1180
        ? 8
        : readerWidth < 1800
          ? 10
          : 14;
  const bodyFontSize = Math.round(
    (isPhone ? 16 : isCompact ? 18 : readerWidth < 1200 ? 21 : 23) * typeScale,
  );
  const bodyLineHeight = Math.round(bodyFontSize * 1.82);
  const sectionFontSize = Math.round(
    (isPhone ? 23 : isCompact ? 26 : readerWidth < 1200 ? 31 : 34) * typeScale,
  );
  const sectionLineHeight = Math.round(sectionFontSize * 1.35);
  const endnoteFontSize = Math.round(
    (isPhone ? 13 : isCompact ? 15 : 18) * typeScale,
  );
  const endnoteLineHeight = Math.round(endnoteFontSize * 1.68);
  const coverTitleSize = isPhone ? 21 : isCompact ? 24 : 30;
  const coverMetaSize = isPhone ? 12 : isCompact ? 13 : 15;

  return {
    pageWidth: Math.max(isPhone ? 292 : 280, columnWidth),
    pagePaddingY,
    contentWidth: Math.max(isPhone ? 292 : 240, columnWidth - textLayoutSafetyInset),
    contentHeight: Math.max(
      220,
      readerHeight - shellPaddingY * 2 - pagePaddingY * 2 - bottomUiReserve,
    ),
    bodyFontSize,
    bodyLineHeight,
    sectionFontSize,
    sectionLineHeight,
    endnoteFontSize,
    endnoteLineHeight,
    coverTitleSize,
    coverMetaSize,
  };
}

function applyMetrics(metrics) {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--page-width", `${metrics.pageWidth}px`);
  rootStyle.setProperty("--page-padding-y", `${metrics.pagePaddingY}px`);
  rootStyle.setProperty("--body-font-size", `${metrics.bodyFontSize}px`);
  rootStyle.setProperty("--body-line-height", `${metrics.bodyLineHeight}px`);
  rootStyle.setProperty("--section-font-size", `${metrics.sectionFontSize}px`);
  rootStyle.setProperty("--section-line-height", `${metrics.sectionLineHeight}px`);
  rootStyle.setProperty("--endnote-font-size", `${metrics.endnoteFontSize}px`);
  rootStyle.setProperty("--endnote-line-height", `${metrics.endnoteLineHeight}px`);
  rootStyle.setProperty("--cover-title-size", `${metrics.coverTitleSize}px`);
  rootStyle.setProperty("--cover-meta-size", `${metrics.coverMetaSize}px`);
}

function paginate(manuscript, metrics) {
  const pages = [{ index: 0, type: "cover", locator: { kind: "cover" } }];
  const notePages = new Map();
  const noteRefPages = new Map();
  const sectionPages = [];
  recordNoteRefs(manuscript.cover.titleTokens, 0, noteRefPages);

  let currentPage = createContentPage(1);

  for (const block of manuscript.blocks) {
    const layout = layoutBlock(block, metrics);

    if (shouldStartNewPageBeforeBlock(block, currentPage)) {
      pages.push(currentPage);
      currentPage = createContentPage(pages.length);
    }

    let cursor = 0;
    while (cursor < layout.lines.length) {
      const available = metrics.contentHeight - currentPage.usedHeight;
      const minLines = minimumVisibleLines(block.type, layout.lines.length - cursor);

      if (currentPage.segments.length > 0 && available < layout.style.lineHeight * minLines) {
        pages.push(currentPage);
        currentPage = createContentPage(pages.length);
        continue;
      }

      let maxLines = Math.max(1, Math.floor(available / layout.style.lineHeight));
      let take = Math.min(layout.lines.length - cursor, maxLines);
      let isBlockEnd = cursor + take >= layout.lines.length;
      let extraHeight =
        (isBlockEnd ? layout.style.gapAfter : 0) +
        (isBlockEnd && block.type === "endnote" ? layout.style.backLinkLineHeight : 0);

      while (
        take > 1 &&
        currentPage.usedHeight + take * layout.style.lineHeight + extraHeight >
          metrics.contentHeight + 0.01
      ) {
        take -= 1;
        isBlockEnd = cursor + take >= layout.lines.length;
        extraHeight =
          (isBlockEnd ? layout.style.gapAfter : 0) +
          (isBlockEnd && block.type === "endnote" ? layout.style.backLinkLineHeight : 0);
      }

      const segment = {
        blockId: block.id,
        blockType: block.type,
        noteNumber: block.noteNumber ?? null,
        styleKey: block.type,
        lineStart: cursor,
        lineEnd: cursor + take,
        isBlockStart: cursor === 0,
        isBlockEnd,
        lines: layout.lines.slice(cursor, cursor + take),
      };

      if (!currentPage.locator) {
        currentPage.locator = { kind: "block", blockId: block.id, lineStart: cursor };
      }

      if (block.type === "section" && cursor === 0) {
        sectionPages.push({
          blockId: block.id,
          text: block.text ?? extractInlineText(block.tokens ?? []),
          pageIndex: currentPage.index,
        });
      }

      currentPage.segments.push(segment);
      currentPage.usedHeight += take * layout.style.lineHeight + extraHeight;
      recordSegmentMappings(segment, currentPage.index, notePages, noteRefPages);

      cursor += take;
      if (cursor < layout.lines.length) {
        pages.push(currentPage);
        currentPage = createContentPage(pages.length);
      }
    }
  }

  if (currentPage.segments.length > 0) {
    pages.push(currentPage);
  }

  return { pages, notePages, noteRefPages, sectionPages };
}

function createContentPage(index) {
  return {
    index,
    type: "content",
    segments: [],
    usedHeight: 0,
    locator: null,
  };
}

function shouldStartNewPageBeforeBlock(block, currentPage) {
  if (currentPage.segments.length === 0) {
    return false;
  }
  return block.type === "section" || block.type === "endnoteHeading";
}

function minimumVisibleLines(blockType, remainingLines) {
  const preferred =
    blockType === "paragraph" || blockType === "listItem" || blockType === "endnote"
      ? 2
      : 1;
  return Math.min(preferred, remainingLines);
}

function getStyleSpec(type, metrics) {
  if (type === "section") {
    return {
      font: `600 ${metrics.sectionFontSize}px "Noto Serif KR"`,
      lineHeight: metrics.sectionLineHeight,
      gapAfter: Math.round(metrics.sectionLineHeight * 0.74),
      backLinkLineHeight: 0,
    };
  }
  if (type === "endnoteHeading") {
    return {
      font: `600 ${Math.round(metrics.sectionFontSize * 0.94)}px "Noto Serif KR"`,
      lineHeight: metrics.sectionLineHeight,
      gapAfter: Math.round(metrics.sectionLineHeight * 0.8),
      backLinkLineHeight: 0,
    };
  }
  if (type === "endnote") {
    return {
      font: `400 ${metrics.endnoteFontSize}px "Noto Serif KR"`,
      lineHeight: metrics.endnoteLineHeight,
      gapAfter: Math.round(metrics.endnoteLineHeight * 0.76),
      backLinkLineHeight: metrics.endnoteLineHeight,
    };
  }
  if (type === "asterism") {
    return {
      font: `400 ${Math.round(metrics.bodyFontSize * 0.92)}px "Noto Serif KR"`,
      lineHeight: metrics.bodyLineHeight,
      gapAfter: Math.round(metrics.bodyLineHeight * 0.5),
      backLinkLineHeight: 0,
    };
  }
  return {
    font: `400 ${metrics.bodyFontSize}px "Noto Serif KR"`,
    lineHeight: metrics.bodyLineHeight,
    gapAfter: Math.round(metrics.bodyLineHeight * 0.76),
    backLinkLineHeight: 0,
  };
}

function layoutBlock(block, metrics) {
  const style = getStyleSpec(block.type, metrics);
  const model = buildTextModel(block);
  const lines = wrapFragmentsToLines(model.fragments, metrics.contentWidth, style.font);
  return { style, lines };
}

function buildTextModel(block) {
  let tokens = [];

  if (block.type === "listItem") {
    tokens = [{ type: "text", text: `${block.marker} ` }, ...(block.tokens ?? [])];
  } else if (block.type === "endnote") {
    tokens = [{ type: "text", text: `${block.noteNumber}. ` }, ...(block.tokens ?? [])];
  } else if (block.type === "asterism") {
    tokens = [{ type: "text", text: block.text }];
  } else {
    tokens = block.tokens ?? [];
  }

  const fragments = [];
  for (const token of tokens) {
    if (token.text) {
      fragments.push({ ...token });
    }
  }
  return { fragments };
}

function wrapFragmentsToLines(fragments, maxWidth, font) {
  const units = buildWrapUnits(fragments);
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;
  let index = 0;

  while (index < units.length) {
    const unit = units[index];
    const widths = measureUnit(unit, font);
    const widthAtLineStart = widths.withoutLeadingSpace;
    const widthWithinLine = widths.withLeadingSpace;

    if (currentLine.length === 0) {
      if (widthAtLineStart <= maxWidth || unit.fragments.length === 0) {
        currentLine.push(...renderUnitFragments(unit, true));
        currentWidth = widthAtLineStart;
        index += 1;
        continue;
      }

      const split = splitUnitToFit(unit, maxWidth, font);
      currentLine.push(...renderUnitFragments(split.fitUnit, true));
      lines.push({ fragments: currentLine });
      currentLine = [];
      currentWidth = 0;
      if (split.restUnit) {
        units[index] = split.restUnit;
      } else {
        index += 1;
      }
      continue;
    }

    if (currentWidth + widthWithinLine <= maxWidth) {
      currentLine.push(...renderUnitFragments(unit, false));
      currentWidth += widthWithinLine;
      index += 1;
      continue;
    }

    lines.push({ fragments: currentLine });
    currentLine = [];
    currentWidth = 0;
  }

  if (currentLine.length > 0 || lines.length === 0) {
    lines.push({ fragments: currentLine });
  }

  return lines;
}

function buildWrapUnits(fragments) {
  const units = [];
  let pendingSpace = "";

  for (const fragment of fragments) {
    if (!fragment.text) {
      continue;
    }

    if (fragment.type === "noteRef" && units.length > 0) {
      appendFragmentToUnit(units[units.length - 1], fragment);
      continue;
    }

    if (fragment.type !== "text") {
      units.push({ leadingSpace: pendingSpace, fragments: [cloneFragment(fragment, fragment.text)] });
      pendingSpace = "";
      continue;
    }

    const parts = fragment.text.split(/(\s+)/u);
    for (const part of parts) {
      if (!part) {
        continue;
      }
      if (/^\s+$/u.test(part)) {
        pendingSpace += part;
        continue;
      }

      let remaining = part;
      const closers = remaining.match(/^[\)\]\}»”’』」〉》】〕〗]+/u)?.[0] ?? "";
      if (closers) {
        if (units.length > 0) {
          appendTextToUnit(units[units.length - 1], closers);
          remaining = remaining.slice(closers.length);
        }
      }

      if (!remaining) {
        continue;
      }

      units.push({
        leadingSpace: pendingSpace,
        fragments: [cloneFragment(fragment, remaining)],
      });
      pendingSpace = "";
    }
  }

  return units;
}

function appendFragmentToUnit(unit, fragment) {
  appendFragmentText(unit.fragments, fragment, fragment.text);
}

function appendTextToUnit(unit, text) {
  appendFragmentText(unit.fragments, { type: "text" }, text);
}

function appendFragmentText(target, fragment, text) {
  if (!text) {
    return;
  }

  const last = target[target.length - 1];
  if (last && sameFragmentKind(last, fragment)) {
    last.text += text;
    return;
  }

  target.push(cloneFragment(fragment, text));
}

function sameFragmentKind(left, right) {
  return (
    left.type === right.type &&
    left.href === right.href &&
    left.noteNumber === right.noteNumber
  );
}

function cloneFragment(fragment, text) {
  return { ...fragment, text };
}

function measureUnit(unit, font) {
  return {
    withLeadingSpace:
      measureFragmentText(unit.leadingSpace, font, "text") + measureFragmentsWidth(unit.fragments, font),
    withoutLeadingSpace: measureFragmentsWidth(unit.fragments, font),
  };
}

function measureFragmentsWidth(fragments, font) {
  let width = 0;
  for (const fragment of fragments) {
    width += measureFragmentText(fragment.text, font, fragment.type);
  }
  return width;
}

function measureFragmentText(text, font, type) {
  if (!text) {
    return 0;
  }
  const variantFont = getVariantFont(font, type);
  const key = `${variantFont}::${type || "text"}::${text}`;
  const cached = measurementCache.get(key);
  if (typeof cached === "number") {
    return cached;
  }

  const context = getMeasureContext();
  context.font = variantFont;
  const width = context.measureText(text).width;
  measurementCache.set(key, width);
  return width;
}

function getMeasureContext() {
  if (measureContext) {
    return measureContext;
  }
  const canvas = document.createElement("canvas");
  measureContext = canvas.getContext("2d");
  return measureContext;
}

function getVariantFont(font, type) {
  if (type === "noteRef") {
    return scaleFont(font, 0.66);
  }
  if (type === "backLink") {
    return scaleFont(font, 0.88);
  }
  return font;
}

function scaleFont(font, scale) {
  const match = font.match(/(\d+(?:\.\d+)?)px/u);
  if (!match) {
    return font;
  }
  const size = Number(match[1]);
  return font.replace(match[0], `${Math.max(1, size * scale)}px`);
}

function splitUnitToFit(unit, maxWidth, font) {
  const fitUnit = { leadingSpace: "", fragments: [] };
  const restUnit = { leadingSpace: "", fragments: [] };
  let width = 0;
  let consumedAny = false;

  for (let fragmentIndex = 0; fragmentIndex < unit.fragments.length; fragmentIndex += 1) {
    const fragment = unit.fragments[fragmentIndex];
    const graphemes = Array.from(graphemeSegmenter.segment(fragment.text), (part) => part.segment);

    for (let index = 0; index < graphemes.length; index += 1) {
      const piece = graphemes[index];
      const pieceWidth = measureFragmentText(piece, font, fragment.type);
      const exceeds = width + pieceWidth > maxWidth;

      if (exceeds && consumedAny) {
        const remaining = graphemes.slice(index).join("");
        if (remaining) {
          restUnit.fragments.push(cloneFragment(fragment, remaining));
        }
        for (let next = fragmentIndex + 1; next < unit.fragments.length; next += 1) {
          restUnit.fragments.push(cloneFragment(unit.fragments[next], unit.fragments[next].text));
        }
        return { fitUnit, restUnit: restUnit.fragments.length > 0 ? restUnit : null };
      }

      appendFragmentText(fitUnit.fragments, fragment, piece);
      width += pieceWidth;
      consumedAny = true;

      if (exceeds) {
        const remaining = graphemes.slice(index + 1).join("");
        if (remaining) {
          restUnit.fragments.push(cloneFragment(fragment, remaining));
        }
        for (let next = fragmentIndex + 1; next < unit.fragments.length; next += 1) {
          restUnit.fragments.push(cloneFragment(unit.fragments[next], unit.fragments[next].text));
        }
        return { fitUnit, restUnit: restUnit.fragments.length > 0 ? restUnit : null };
      }
    }
  }

  return { fitUnit, restUnit: null };
}

function renderUnitFragments(unit, atLineStart) {
  const rendered = [];
  if (!atLineStart && unit.leadingSpace) {
    rendered.push({ type: "text", text: unit.leadingSpace });
  }
  for (const fragment of unit.fragments) {
    rendered.push(cloneFragment(fragment, fragment.text));
  }
  return rendered;
}

function extractInlineText(tokens) {
  return tokens.map((token) => token.text ?? "").join("");
}

function recordNoteRefs(tokens, pageIndex, noteRefPages) {
  for (const token of tokens) {
    if (token.type === "noteRef" && !noteRefPages.has(token.noteNumber)) {
      noteRefPages.set(token.noteNumber, pageIndex);
    }
  }
}

function recordSegmentMappings(segment, pageIndex, notePages, noteRefPages) {
  if (segment.noteNumber != null && !notePages.has(segment.noteNumber)) {
    notePages.set(segment.noteNumber, pageIndex);
  }

  for (const line of segment.lines) {
    for (const fragment of line.fragments) {
      if (fragment.type === "noteRef" && !noteRefPages.has(fragment.noteNumber)) {
        noteRefPages.set(fragment.noteNumber, pageIndex);
      }
    }
  }
}

function renderPages() {
  pageTrack.innerHTML = "";
  for (const page of state.pages) {
    const shell = document.createElement("section");
    shell.className = `page-shell ${
      page.type === "cover" ? "page-shell--cover" : "page-shell--content"
    }`;
    shell.dataset.pageIndex = String(page.index);
    shell.appendChild(page.type === "cover" ? renderCoverPage() : renderContentPage(page));
    pageTrack.appendChild(shell);
  }
  syncTrackGeometry();
  queueCoverResponsiveLayout();
}

function queueCoverResponsiveLayout() {
  if (state.coverLayoutRaf) {
    window.cancelAnimationFrame(state.coverLayoutRaf);
  }

  state.coverLayoutRaf = window.requestAnimationFrame(() => {
    state.coverLayoutRaf = 0;
    syncCoverResponsiveLayout();
  });
}

function syncCoverResponsiveLayout() {
  const coverPage = pageTrack.querySelector(".page--cover");
  const coverArt = coverPage?.querySelector(".cover-art");
  const coverMeta = coverPage?.querySelector(".cover-meta");
  const pageShell = coverPage?.closest(".page-shell");
  if (
    !(coverPage instanceof HTMLElement) ||
    !(coverArt instanceof HTMLElement) ||
    !(coverMeta instanceof HTMLElement) ||
    !(pageShell instanceof HTMLElement)
  ) {
    return;
  }

  const clearResponsiveVars = () => {
    coverPage.style.removeProperty("--cover-art-height");
    coverPage.style.removeProperty("--cover-panel-group-width");
    coverPage.style.removeProperty("--cover-panel-gap");
    coverPage.style.removeProperty("--cover-side-width");
    coverPage.style.removeProperty("--cover-side-gap");
    coverPage.style.removeProperty("--cover-suits-left");
    coverPage.style.removeProperty("--cover-suits-top");
    coverPage.style.removeProperty("--cover-suits-width");
    coverPage.style.removeProperty("--cover-meta-margin-left");
    coverPage.style.removeProperty("--cover-meta-margin-top");
    coverPage.style.removeProperty("--cover-meta-width");
  };

  if (window.innerWidth <= 1100) {
    clearResponsiveVars();
    return;
  }

  const artWidth = Math.max(coverArt.clientWidth, 1);
  const compactDesktop = window.innerWidth <= 1520 || window.innerHeight <= 920;
  const coverStyle = window.getComputedStyle(coverPage);
  const paddingTop = Number.parseFloat(coverStyle.paddingTop || "0") || 0;
  const paddingBottom = Number.parseFloat(coverStyle.paddingBottom || "0") || 0;
  const coverGap = Number.parseFloat(coverStyle.rowGap || coverStyle.gap || "0") || 0;
  const metaHeight = Math.max(coverMeta.offsetHeight, 1);
  const artHeightTarget = compactDesktop
    ? clamp(window.innerHeight * 0.49, 300, 560)
    : clamp(window.innerHeight * 0.56, 360, 620);
  // 표지 메타 블록과 여백까지 포함해 현재 page-shell 높이 안에 들어오도록
  // 하늘 패널 묶음 높이를 제한합니다. 그래야 제목/각주가 하단 컨트롤 영역으로
  // 밀려나지 않고, 맥에서 hover hit-test도 안정됩니다.
  const metaOffsetY = compactDesktop ? 56 : 36;
  const maxArtHeightFromPage = Math.max(
    compactDesktop ? 240 : 300,
    pageShell.clientHeight -
      paddingTop -
      paddingBottom -
      coverGap -
      metaHeight -
      metaOffsetY -
      (compactDesktop ? 18 : 10),
  );
  const artHeight = Math.min(artHeightTarget, maxArtHeightFromPage);
  const gap = compactDesktop ? clamp(window.innerWidth * 0.014, 16, 22) : clamp(window.innerWidth * 0.018, 18, 28);
  const sideGap = compactDesktop ? clamp(window.innerWidth * 0.011, 12, 18) : clamp(window.innerWidth * 0.014, 14, 24);
  const sideWidth = clamp(
    (artHeight - sideGap) / COVER_SIDE_STACK_RATIO,
    compactDesktop ? 124 : 184,
    compactDesktop ? 296 : 330,
  );
  const groupWidthByHeight = artHeight / COVER_MAIN_PANEL_RATIO + gap + sideWidth;
  const groupWidthByWidth = Math.min(artWidth * (compactDesktop ? 0.775 : 0.81), compactDesktop ? 960 : 1080);
  const groupWidth = Math.min(groupWidthByWidth, groupWidthByHeight);
  const mainWidth = Math.max(300, groupWidth - gap - sideWidth);
  const groupLeft = Math.max(0, artWidth - groupWidth);
  const mainHeight = mainWidth * COVER_MAIN_PANEL_RATIO;
  const suitsWidth = mainWidth * (compactDesktop ? 0.39 : 0.43);
  const suitsLeft = groupLeft + mainWidth * (compactDesktop ? 0.145 : 0.135);
  const suitsTop = Math.min(
    artHeight - suitsWidth * 0.08,
    mainHeight * (compactDesktop ? 0.665 : 0.655),
  );
  const metaWidth = Math.min(mainWidth * (compactDesktop ? 0.52 : 0.56), compactDesktop ? 410 : 450);
  // 표지 타이틀/저자/부제/날짜 블록 위치 조정값:
  // `groupLeft`는 "메인 하늘 패널이 시작되는 자동 기준점"입니다.
  // 이 값 자체는 레이아웃 계산 결과라 화면에 따라 변화 폭이 작을 수 있습니다.
  // 실제 미세 조정은 아래 `metaOffsetX`, `metaOffsetY`만 수정하시면 됩니다.
  // `metaOffsetX` 값을 키우면 더 오른쪽으로 이동합니다.
  // `metaOffsetY` 값을 키우면 더 아래로 내려갑니다.
  const metaOffsetX = compactDesktop ? 40 : 2;
  const metaMarginLeft = groupLeft + metaOffsetX;
  const metaMarginTop = metaOffsetY;


  coverPage.style.setProperty("--cover-art-height", `${Math.round(artHeight)}px`);
  coverPage.style.setProperty("--cover-panel-group-width", `${Math.round(groupWidth)}px`);
  coverPage.style.setProperty("--cover-panel-gap", `${Math.round(gap)}px`);
  coverPage.style.setProperty("--cover-side-width", `${Math.round(sideWidth)}px`);
  coverPage.style.setProperty("--cover-side-gap", `${Math.round(sideGap)}px`);
  coverPage.style.setProperty("--cover-suits-left", `${Math.round(suitsLeft)}px`);
  coverPage.style.setProperty("--cover-suits-top", `${Math.round(suitsTop)}px`);
  coverPage.style.setProperty("--cover-suits-width", `${Math.round(suitsWidth)}px`);
  coverPage.style.setProperty("--cover-meta-margin-left", `${Math.round(metaMarginLeft)}px`);
  coverPage.style.setProperty("--cover-meta-margin-top", `${Math.round(metaMarginTop)}px`);
  coverPage.style.setProperty("--cover-meta-width", `${Math.round(metaWidth)}px`);
}

function syncTrackGeometry() {
  const pageWidth = Math.max(reader.clientWidth || window.innerWidth, 1);
  pageTrack.style.width = `${pageWidth * Math.max(state.pages.length, 1)}px`;

  for (const shell of pageTrack.children) {
    shell.style.flex = `0 0 ${pageWidth}px`;
    shell.style.width = `${pageWidth}px`;
  }
}

function renderContents() {
  if (!contentsPanel) {
    return;
  }

  contentsPanel.innerHTML = "";
  for (const item of state.sectionPages) {
    const link = document.createElement("a");
    link.className = "contents-link";
    link.href = hashForPage(item.pageIndex);
    link.dataset.pageLink = String(item.pageIndex);
    link.textContent = item.text;
    contentsPanel.appendChild(link);
  }
  updateContentsActive();
}

function updateContentsActive() {
  if (!contentsPanel) {
    return;
  }

  let activeIndex = -1;
  for (let index = 0; index < state.sectionPages.length; index += 1) {
    if (state.sectionPages[index].pageIndex <= state.currentPage) {
      activeIndex = index;
    }
  }

  const links = contentsPanel.querySelectorAll(".contents-link");
  links.forEach((link, index) => {
    link.classList.toggle("is-active", index === activeIndex);
  });
}

function updateCoverContext() {
  document.body.classList.toggle("is-cover-active", state.currentPage === 0);
}

function updatePageSlider() {
  if (!pageSlider) {
    return;
  }

  const pageCount = Math.max(state.pages.length, 1);
  const max = Math.max((pageCount - 1) * state.sliderScale, 1);
  pageSlider.min = "0";
  pageSlider.max = String(max);
  pageSlider.step = "1";
  if (!state.isSliderScrubbing) {
    pageSlider.value = String(Math.round(state.currentPage * state.sliderScale));
  }
  pageSlider.disabled = pageCount <= 1;
  updatePageCounter(pageCount);
}

function updatePageCounter(pageCount = Math.max(state.pages.length, 1)) {
  if (!pageCounter) {
    return;
  }
  const current = clamp(state.currentPage + 1, 1, pageCount);
  pageCounter.textContent = `${current} / ${pageCount}`;
  pageCounter.hidden = pageCount <= 1;
}

function resolvePageLeft(pageIndex) {
  const shell = pageTrack.children[pageIndex];
  return shell instanceof HTMLElement
    ? shell.offsetLeft
    : (reader.clientWidth || window.innerWidth) * pageIndex;
}

function clearPendingPageTurn() {
  if (state.pendingPageTimer) {
    window.clearTimeout(state.pendingPageTimer);
    state.pendingPageTimer = 0;
  }
  state.pendingPage = null;
  state.pendingScrollLeft = null;
}

function holdPendingPageTurn(targetPage, targetLeft) {
  clearPendingPageTurn();
  state.pendingPage = targetPage;
  state.pendingScrollLeft = targetLeft;
  state.pendingPageTimer = window.setTimeout(() => {
    clearPendingPageTurn();
    syncCurrentPageFromScroll();
  }, 900);
}

function renderCoverPage() {
  const cover = state.manuscript.cover;
  const page = document.createElement("article");
  page.className = "page page--cover";

  const art = document.createElement("div");
  art.className = "cover-art";
  art.setAttribute("role", "img");
  art.setAttribute("aria-label", "사랑과 은총의 기계들 분리 에셋으로 재구성한 표지");

  const mainPanel = createCoverPanel(
    "cover-panel cover-panel--main",
    "./assets/cover-a3.png",
  );
  const topPanel = createCoverPanel(
    "cover-panel cover-panel--top",
    "./assets/cover-a4.png",
  );
  const rightPanel = createCoverPanel(
    "cover-panel cover-panel--right",
    "./assets/cover-a5.png",
  );
  const structure = document.createElement("img");
  structure.className = "cover-structure";
  structure.src = "./assets/cover-a1.png";
  structure.alt = "";
  structure.setAttribute("aria-hidden", "true");
  const suits = document.createElement("img");
  suits.className = "cover-suits";
  suits.src = "./assets/cover-a2.png";
  suits.alt = "";
  suits.setAttribute("aria-hidden", "true");

  const panelGroup = document.createElement("div");
  panelGroup.className = "cover-panel-group";

  const sideStack = document.createElement("div");
  sideStack.className = "cover-side-stack";
  sideStack.append(topPanel, rightPanel);

  panelGroup.append(mainPanel, sideStack);
  art.append(panelGroup, structure, suits);

  const meta = document.createElement("div");
  meta.className = "cover-meta";
  const title = document.createElement("h1");
  title.className = "cover-title";
  appendInlineFragments(title, cover.titleTokens);

  const author = document.createElement("p");
  author.className = "cover-author";
  author.textContent = COVER_AUTHOR;

  const subtitle = document.createElement("p");
  subtitle.className = "cover-subtitle";
  appendInlineFragments(subtitle, cover.subtitleTokens);

  const date = document.createElement("p");
  date.className = "cover-date";
  appendInlineFragments(date, cover.dateTokens);

  meta.append(title, author, subtitle, date);
  page.append(art, meta);
  return page;
}

function createCoverPanel(className, src) {
  const panel = document.createElement("div");
  panel.className = className;

  const image = document.createElement("img");
  image.className = "cover-panel-image";
  image.src = src;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");

  panel.appendChild(image);
  return panel;
}

function renderContentPage(pageData) {
  const page = document.createElement("article");
  page.className = "page";

  const flow = document.createElement("div");
  flow.className = "content-flow";

  for (const segment of pageData.segments) {
    flow.appendChild(renderSegment(segment));
  }

  page.appendChild(flow);
  return page;
}

function renderSegment(segment) {
  const blockTag =
    segment.blockType === "section" || segment.blockType === "endnoteHeading" ? "h2" : "p";
  const element = document.createElement(blockTag);
  element.className = `segment segment--${segment.styleKey}`;

  const style = getStyleSpec(segment.blockType, state.metrics);
  element.style.marginBottom = segment.isBlockEnd ? `${style.gapAfter}px` : "0px";

  for (const line of segment.lines) {
    const lineElement = document.createElement("span");
    lineElement.className = "segment-line";
    appendInlineFragments(lineElement, line.fragments);
    element.appendChild(lineElement);
  }

  if (segment.blockType === "endnote" && segment.isBlockEnd) {
    const pageIndex = state.noteRefPages.get(segment.noteNumber);
    if (typeof pageIndex === "number") {
      const lineElement = document.createElement("span");
      lineElement.className = "segment-line";
      const anchor = document.createElement("a");
      anchor.className = "back-link";
      anchor.textContent = "본문으로";
      anchor.href = hashForPage(pageIndex);
      anchor.dataset.pageLink = String(pageIndex);
      lineElement.appendChild(anchor);
      element.appendChild(lineElement);
    }
  }

  return element;
}

function appendInlineFragments(container, fragments) {
  for (const fragment of fragments) {
    if (!fragment.text) {
      continue;
    }

    if (fragment.type === "link") {
      const anchor = document.createElement("a");
      anchor.className = "link";
      anchor.href = fragment.href;
      anchor.target = "_blank";
      anchor.rel = "noreferrer noopener";
      anchor.textContent = fragment.text;
      container.appendChild(anchor);
      continue;
    }

    if (fragment.type === "noteRef") {
      const anchor = document.createElement("a");
      anchor.className = "note-ref";
      anchor.textContent = fragment.text;
      const pageIndex = state.notePages.get(fragment.noteNumber) ?? 0;
      anchor.href = hashForPage(pageIndex);
      anchor.dataset.pageLink = String(pageIndex);
      anchor.dataset.noteNumber = String(fragment.noteNumber);
      container.appendChild(anchor);
      continue;
    }

    container.appendChild(document.createTextNode(fragment.text));
  }
}

function rememberCurrentLocator() {
  return state.pages[state.currentPage]?.locator ?? { kind: "cover" };
}

function collectEndnotes(manuscript) {
  const endnotes = new Map();
  for (const block of manuscript.blocks ?? []) {
    if (block.type === "endnote" && block.noteNumber != null) {
      endnotes.set(block.noteNumber, block.tokens ?? []);
    }
  }
  return endnotes;
}

function shouldUseInlineNotePreview() {
  if (window.innerWidth <= 1000) {
    return false;
  }

  const touchLikeViewport =
    window.matchMedia?.("(hover: none), (pointer: coarse)").matches ||
    (navigator.maxTouchPoints || 0) > 0;
  if (touchLikeViewport && window.innerWidth <= 1366) {
    return false;
  }

  const readerWidth = reader?.clientWidth || window.innerWidth;
  const pageWidth = state.metrics?.pageWidth ?? Math.min(readerWidth, 760);
  const sideGutter = Math.max(0, (readerWidth - pageWidth) / 2);
  const inlineNoteWidth =
    window.innerWidth < 1400
      ? clamp(window.innerWidth * 0.145, 200, 248)
      : clamp(window.innerWidth * 0.18, 220, 288);
  const measuredSpace = measureInlineNoteSpace(null, inlineNoteWidth);
  if (measuredSpace) {
    return measuredSpace.canInline;
  }

  return sideGutter >= inlineNoteWidth + INLINE_NOTE_RIGHT_INSET;
}

function isTouchLikeViewport() {
  return Boolean(
    window.matchMedia?.("(hover: none), (pointer: coarse)").matches ||
      (navigator.maxTouchPoints || 0) > 0,
  );
}

function hasComfortableCoverStructurePreviewSpace() {
  const viewportWidth =
    window.visualViewport?.width ||
    window.innerWidth ||
    document.documentElement.clientWidth ||
    0;
  const viewportHeight =
    window.visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight ||
    0;

  // 표지 1번 각주는 데스크톱 폭 이상이면 왼쪽 구조물 오버레이를 우선합니다.
  // 이 케이스에서 세부 레인 폭 계산은 브라우저별 hit-test 차이보다 불안정해서,
  // 실제 디바이스 대응은 폭/높이 기준으로 단순화하는 편이 더 견고합니다.
  return viewportWidth >= 1240 && viewportHeight >= 700;
}

function shouldUseCoverStructureNotePreview(noteNumber) {
  return (
    state.currentPage === 0 &&
    noteNumber === 1 &&
    hasComfortableCoverStructurePreviewSpace()
  );
}

function shouldUseMobileNoteSheet() {
  return !shouldUseInlineNotePreview();
}

function tryToggleInlineNotePin(anchor, event) {
  if (!notePreview) {
    return false;
  }
  const noteNumber = Number(anchor.dataset.noteNumber);
  if (!Number.isFinite(noteNumber) || !hasInlineNotePreviewContent(noteNumber)) {
    return false;
  }
  const useCoverStructurePreview = shouldUseCoverStructureNotePreview(noteNumber);

  if (!useCoverStructurePreview && shouldUseMobileNoteSheet()) {
    event.preventDefault();
    clearNotePreviewHideTimer();

    if (state.activeNoteNumber === noteNumber && !notePreview.hidden) {
      closeNotePreview();
      return true;
    }

    openNotePreview(noteNumber, anchor, { pinned: true, mobileSheet: true });
    return true;
  }

  if (!useCoverStructurePreview && !shouldUseInlineNotePreview()) {
    return false;
  }

  event.preventDefault();
  clearNotePreviewHideTimer();

  if (state.pinnedNoteNumber === noteNumber && !notePreview.hidden) {
    closeNotePreview();
    return true;
  }

  openNotePreview(noteNumber, anchor, { pinned: true });
  return true;
}

function openNotePreview(noteNumber, anchor, options = {}) {
  if (!notePreview) {
    return;
  }
  const previewData = resolveNotePreviewData(noteNumber);
  if (!previewData) {
    closeNotePreview();
    return;
  }
  const pinned = options.pinned === true;
  const useCoverStructurePreview = shouldUseCoverStructureNotePreview(noteNumber);
  const useMobileSheet =
    options.mobileSheet === true || (!useCoverStructurePreview && shouldUseMobileNoteSheet());

  notePreview.innerHTML = "";
  notePreview.classList.remove("note-preview--poem");
  notePreview.classList.remove("note-preview--cover");
  notePreview.classList.remove("note-preview--cover-left");
  notePreview.classList.remove("note-preview--sheet");
  notePreview.classList.toggle("note-preview--poem", previewData.kind === "poem");
  notePreview.classList.toggle("note-preview--cover", state.currentPage === 0 && !useMobileSheet);
  notePreview.classList.toggle("note-preview--cover-left", useCoverStructurePreview && !useMobileSheet);
  notePreview.classList.toggle("note-preview--sheet", useMobileSheet);
  renderNotePreviewBody(notePreview, previewData, noteNumber);
  notePreview.hidden = false;
  notePreview.classList.add("is-active");
  notePreview.classList.toggle("is-pinned", pinned);
  state.activeNoteNumber = noteNumber;
  state.pinnedNoteNumber = pinned ? noteNumber : null;
  updateActiveNoteRefs();

  if (useMobileSheet) {
    notePreview.style.removeProperty("--note-preview-top");
    notePreview.style.removeProperty("left");
    notePreview.style.removeProperty("right");
    notePreview.style.removeProperty("max-height");
    return;
  }

  const inlineSpace = useCoverStructurePreview
    ? null
    : measureInlineNoteSpace(anchor, notePreview.offsetWidth);
  if (inlineSpace && !inlineSpace.canInline) {
    notePreview.classList.add("note-preview--sheet");
    notePreview.style.removeProperty("--note-preview-top");
    notePreview.style.removeProperty("left");
    notePreview.style.removeProperty("right");
    return;
  }

  placeNotePreview(anchor);
}

function getCurrentPageElement(anchor = null) {
  const anchoredPage = anchor?.closest(".page");
  if (anchoredPage instanceof HTMLElement) {
    return anchoredPage;
  }

  return pageTrack?.querySelector(
    `.page-shell[data-page-index="${state.currentPage}"] .page`,
  );
}

function measureInlineNoteSpace(anchor, previewWidth) {
  if (!notePreview) {
    return null;
  }

  const column = notePreview.parentElement;
  const pageElement = getCurrentPageElement(anchor);
  if (!(column instanceof HTMLElement) || !(pageElement instanceof HTMLElement)) {
    return null;
  }

  const columnRect = column.getBoundingClientRect();
  const pageRect = pageElement.getBoundingClientRect();
  const requiredWidth = Math.max(previewWidth || 0, 0);
  const availableRight = Math.max(0, columnRect.right - pageRect.right);

  return {
    availableRight,
    canInline: availableRight >= requiredWidth + INLINE_NOTE_RIGHT_INSET,
  };
}

function placeNotePreview(anchor) {
  if (!notePreview) {
    return;
  }
  const column = notePreview.parentElement;
  if (!(column instanceof HTMLElement)) {
    return;
  }

  const columnRect = column.getBoundingClientRect();
  const readerRect = reader?.getBoundingClientRect() ?? columnRect;
  const pageRect = getCurrentPageElement(anchor)?.getBoundingClientRect() ?? readerRect;
  const previewBottomLimit = Math.min(readerRect.bottom, pageRect.bottom);
  const maxPreviewHeight = Math.max(previewBottomLimit - columnRect.top - 32, 180);
  const anchorRect = anchor.getBoundingClientRect();
  notePreview.style.removeProperty("left");
  notePreview.style.removeProperty("right");
  notePreview.style.maxHeight = `${Math.round(maxPreviewHeight)}px`;

  if (notePreview.classList.contains("note-preview--cover-left")) {
    const coverPage = anchor.closest(".page--cover");
    const coverArt = coverPage?.querySelector(".cover-art");
    if (coverArt instanceof HTMLElement) {
      const coverArtRect = coverArt.getBoundingClientRect();
      const availableBottom = Math.max(previewBottomLimit - columnRect.top - 24, 24);
      const maxTop = Math.max(availableBottom - notePreview.offsetHeight, 24);
      const top = clamp(
        coverArtRect.top - columnRect.top + Math.max(28, coverArtRect.height * 0.12),
        24,
        maxTop,
      );
      const preferredLeft =
        coverArtRect.left - columnRect.left - notePreview.offsetWidth - clamp(window.innerWidth * 0.02, 22, 34);
      const minLeft = -Math.min(notePreview.offsetWidth * 0.72, 260);
      const left = Math.max(preferredLeft, minLeft);
      notePreview.style.setProperty("--note-preview-top", `${Math.round(top)}px`);
      notePreview.style.left = `${Math.round(left)}px`;
      notePreview.style.right = "auto";
      return;
    }
  }

  if (state.currentPage === 0) {
    const coverPage = anchor.closest(".page--cover");
    const topPanel = coverPage?.querySelector(".cover-panel--top");
    if (topPanel instanceof HTMLElement) {
      const topPanelRect = topPanel.getBoundingClientRect();
      const availableBottom = Math.max(previewBottomLimit - columnRect.top - 24, 24);
      const maxTop = Math.max(availableBottom - notePreview.offsetHeight, 24);
      const coverTop = clamp(topPanelRect.bottom - columnRect.top + 18, 24, maxTop);
      notePreview.style.setProperty("--note-preview-top", `${Math.round(coverTop)}px`);
      notePreview.style.right = `max(28px, env(safe-area-inset-right))`;
      return;
    }
  }
  const preferredTop = anchorRect.top - columnRect.top - 18;
  const availableBottom = Math.max(previewBottomLimit - columnRect.top - 24, 24);
  const maxTop = Math.max(availableBottom - notePreview.offsetHeight, 24);
  const top = clamp(preferredTop, 24, maxTop);
  notePreview.style.setProperty("--note-preview-top", `${Math.round(top)}px`);
  notePreview.style.right = `max(28px, env(safe-area-inset-right))`;
}

function closeNotePreview() {
  clearNotePreviewHideTimer();
  if (!notePreview || notePreview.hidden) {
    state.activeNoteNumber = null;
    state.pinnedNoteNumber = null;
    updateActiveNoteRefs();
    return;
  }

  notePreview.classList.remove("is-active");
  notePreview.classList.remove("is-pinned");
  notePreview.classList.remove("note-preview--poem");
  notePreview.classList.remove("note-preview--cover");
  notePreview.classList.remove("note-preview--cover-left");
  notePreview.classList.remove("note-preview--sheet");
  notePreview.hidden = true;
  notePreview.innerHTML = "";
  notePreview.style.removeProperty("--note-preview-top");
  notePreview.style.removeProperty("left");
  notePreview.style.removeProperty("right");
  notePreview.style.removeProperty("max-height");
  state.activeNoteNumber = null;
  state.pinnedNoteNumber = null;
  updateActiveNoteRefs();
}

function updateActiveNoteRefs() {
  const refs = document.querySelectorAll(".note-ref");
  refs.forEach((ref) => {
    const noteNumber = Number(ref.dataset.noteNumber);
    const isActive = noteNumber === state.activeNoteNumber;
    const isPinned = noteNumber === state.pinnedNoteNumber;
    ref.classList.toggle("is-active", isActive);
    ref.classList.toggle("is-pinned", isPinned);
  });
}

function clearNotePreviewHideTimer() {
  if (state.notePreviewHideTimer) {
    window.clearTimeout(state.notePreviewHideTimer);
    state.notePreviewHideTimer = 0;
  }
}

function scheduleNotePreviewClose() {
  clearNotePreviewHideTimer();
  state.notePreviewHideTimer = window.setTimeout(() => {
    if (state.pinnedNoteNumber == null) {
      closeNotePreview();
    }
  }, 260);
}

function hasInlineNotePreviewContent(noteNumber) {
  return NOTE_PREVIEW_OVERRIDES.has(noteNumber) || state.endnotes.has(noteNumber);
}

function resolveNotePreviewData(noteNumber) {
  if (NOTE_PREVIEW_OVERRIDES.has(noteNumber)) {
    return NOTE_PREVIEW_OVERRIDES.get(noteNumber);
  }
  const tokens = state.endnotes.get(noteNumber);
  if (!tokens) {
    return null;
  }
  return {
    kind: "default",
    label: `${noteNumber}.`,
    tokens,
  };
}

function renderNotePreviewBody(container, previewData, noteNumber) {
  if (previewData.kind === "poem") {
    renderPoemNotePreview(container, previewData);
    return;
  }

  const number = document.createElement("p");
  number.className = "note-preview-number";
  number.textContent = previewData.label ?? `${noteNumber}.`;

  const body = document.createElement("div");
  body.className = "note-preview-body";

  const paragraph = document.createElement("p");
  paragraph.className = "note-preview-text";
  appendInlineFragments(paragraph, previewData.tokens ?? []);
  body.appendChild(paragraph);

  container.append(number, body);
}

function renderPoemNotePreview(container, previewData) {
  const label = document.createElement("p");
  label.className = "note-preview-kicker";
  label.textContent = previewData.label;

  const title = document.createElement("h3");
  title.className = "note-preview-title";
  title.textContent = previewData.title;

  const author = document.createElement("p");
  author.className = "note-preview-author";
  author.textContent = previewData.author;

  const poem = document.createElement("div");
  poem.className = "note-preview-poem";

  for (const stanzaLines of previewData.stanzas ?? []) {
    const stanza = document.createElement("p");
    stanza.className = "note-preview-stanza";
    for (const lineText of stanzaLines) {
      const line = document.createElement("span");
      line.className = "note-preview-line";
      line.textContent = lineText;
      stanza.appendChild(line);
    }
    poem.appendChild(stanza);
  }

  container.append(label, title, author, poem);

  if (previewData.source?.href) {
    const source = document.createElement("a");
    source.className = "note-preview-source link";
    source.href = previewData.source.href;
    source.target = "_blank";
    source.rel = "noreferrer noopener";
    source.textContent = previewData.source.text ?? previewData.source.href;
    container.appendChild(source);
  }
}

function resolveLocatorToPage(locator) {
  if (!locator || locator.kind === "cover") {
    return 0;
  }

  let fallback = 0;
  for (const page of state.pages) {
    if (page.type !== "content") {
      continue;
    }

    for (const segment of page.segments) {
      if (segment.blockId !== locator.blockId) {
        continue;
      }
      fallback = page.index;
      if (segment.lineStart <= locator.lineStart && segment.lineEnd > locator.lineStart) {
        return page.index;
      }
    }
  }

  return fallback;
}

function parseHashPage(hash, pageCount) {
  const match = /^#p=(\d+)$/u.exec(hash || "");
  if (!match) {
    return 0;
  }
  return clamp(Number(match[1]) - 1, 0, Math.max(pageCount - 1, 0));
}

function hashForPage(pageIndex) {
  return `#p=${pageIndex + 1}`;
}

function goToPage(pageIndex, options = {}) {
  if (!state.pages.length) {
    return;
  }

  const target = clamp(pageIndex, 0, state.pages.length - 1);
  const behavior = options.behavior ?? "smooth";
  if (behavior !== "smooth") {
    goToPageWithoutMotion(target, {
      updateHash: options.updateHash,
      closePreview: target !== state.currentPage,
    });
    return;
  }

  if (target !== state.currentPage) {
    closeNotePreview();
  }
  state.currentPage = target;

  const left = resolvePageLeft(target);
  holdPendingPageTurn(target, left);
  reader.scrollTo({ left, behavior: "smooth" });

  updateContentsActive();
  updateCoverContext();
  updatePageSlider();

  if (options.updateHash !== false) {
    const nextHash = hashForPage(target);
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }
}

function goToPageWithoutMotion(pageIndex, options = {}) {
  if (!state.pages.length) {
    return;
  }

  const target = clamp(pageIndex, 0, state.pages.length - 1);
  if (options.closePreview !== false && target !== state.currentPage) {
    closeNotePreview();
  }

  state.currentPage = target;
  clearPendingPageTurn();
  jumpReaderTo(resolvePageLeft(target));
  updateContentsActive();
  updateCoverContext();
  updatePageSlider();

  if (options.updateHash !== false) {
    const nextHash = hashForPage(target);
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }
}

function jumpReaderTo(left) {
  reader.scrollLeft = left;
  window.requestAnimationFrame(() => {
    reader.scrollLeft = left;
    window.requestAnimationFrame(() => {
      reader.scrollLeft = left;
    });
  });
}

function syncCurrentPageFromScroll() {
  if (!state.pages.length) {
    return;
  }

  if (state.pendingPage !== null) {
    const pendingLeft =
      typeof state.pendingScrollLeft === "number"
        ? state.pendingScrollLeft
        : resolvePageLeft(state.pendingPage);
    if (Math.abs(reader.scrollLeft - pendingLeft) > 3) {
      return;
    }
    clearPendingPageTurn();
  }

  const pageIndex = resolveNearestPageIndex();
  if (pageIndex === state.currentPage) {
    return;
  }

  state.currentPage = pageIndex;
  updateContentsActive();
  updateCoverContext();
  if (!state.isSliderScrubbing) {
    updatePageSlider();
    const nextHash = hashForPage(pageIndex);
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }
}

function resolveNearestPageIndex() {
  const viewportCenter = reader.scrollLeft + reader.clientWidth / 2;
  let pageIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < pageTrack.children.length; index += 1) {
    const shell = pageTrack.children[index];
    if (!(shell instanceof HTMLElement)) {
      continue;
    }

    const center = shell.offsetLeft + shell.offsetWidth / 2;
    const distance = Math.abs(center - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      pageIndex = index;
    }
  }

  return clamp(pageIndex, 0, state.pages.length - 1);
}

function getSliderFraction(slider) {
  const min = Number(slider.min || 0);
  const max = Number(slider.max || 1);
  const value = Number(slider.value || 0);
  if (max <= min) {
    return 0;
  }
  return clamp((value - min) / (max - min), 0, 1);
}

function scrubReaderToFraction(fraction) {
  const maxScrollLeft = Math.max(pageTrack.scrollWidth - reader.clientWidth, 0);
  const left = maxScrollLeft * fraction;
  reader.scrollLeft = left;
}

function showError(message) {
  if (contentsPanel) {
    contentsPanel.innerHTML = "";
  }
  if (pageSlider) {
    pageSlider.disabled = true;
  }
  pageTrack.innerHTML = "";
  const shell = document.createElement("section");
  shell.className = "page-shell";
  const page = document.createElement("article");
  page.className = "page";
  const paragraph = document.createElement("p");
  paragraph.className = "segment segment--paragraph";
  paragraph.textContent = message;
  page.appendChild(paragraph);
  shell.appendChild(page);
  pageTrack.appendChild(shell);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
