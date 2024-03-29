import { queryParser, toInteger, toPredicate } from "./advancedQuery";
import { Result } from "./attoparsec";
import { relativeDeltaToNow } from "./math";
import { EffectList, h, modify, prettyPrint } from "./utils";

/**
 * @typedef {Object} Column
 * @property {string} label
 * @property {string} type
 * @property {boolean} show
 * @property {(i: number) => any} get
 * @property {(v: any) => string} formatter
 */
/**
 * @typedef {Object} TableData
 * @property {Column[]} columns
 * @property {any} deck
 * @property {number[]} indices
 * @property {number} length
 * @property {number} widthEstimate
 * @property {{ kind: "Warning" | "Error"; message: string }[]} warnings
 */
/**
 * @typedef {Object} Store
 * @property {TableData} tableData
 * @property {number} currentPage
 * @property {string | null} deckName
 * @property {any[]} query
 * @property {string} queryText
 * @property {number} pageSize
 */

export class PagedTableView {
  /**
   * @param {Store} store
   * @param {EffectList} effects
   */
  constructor(store, effects) {
    this.s = store;
    this.r = {
      scrollContainer: document.getElementById('scroll-container'),
      tablist: document.getElementById('tablist'),
      searchInput: document.getElementById('filter-input'),
      searchHelpButton: document.getElementById('filter-help-btn'),
      searchHelp: document.getElementById('filter-help'),
      deckPicker: document.querySelector('#bottom-controls select'),
      pagination: document.getElementById('pagination'),
      paginationReadout: document.getElementById('pagination-readout'),
      table: document.getElementById('sheet-table'),
    };

    this.setTableData = effects.setter(val => { this.s.tableData = val; });
    this.setCurrentPage = effects.setter(val => { this.s.currentPage = val; });
    this.setQuery = effects.setter(val => { this.s.query = val; });
    this.setQueryText = effects.setter(val => {
      this.s.queryText = val;
      this.r.searchInput.value = val;
    });

    effects.register(this.repaginate.bind(this), () => [this.s.tableData, this.s.currentPage]);
    effects.register(this.populateTable.bind(this), () => [this.s.tableData, this.s.currentPage]);
    effects.register(this.calculateQuery.bind(this), () => [this.s.tableData && this.s.tableData.columns, this.s.queryText]);
    effects.register(this.runQuery.bind(this), () => [this.s.tableData && this.s.tableData.columns, this.s.query]);
  }

  setupListeners() {
    const { searchInput, searchHelpButton, searchHelp } = this.r;

    searchInput.addEventListener('input', evt => {
      this.setQueryText(evt.target.value);
      this.setCurrentPage(1);
    });
    if (searchHelpButton && searchHelp) {
      searchHelpButton.addEventListener('click', () => {
        searchHelp.classList.toggle("hidden");
      });
    }
  }

  repaginate() {
    const { pagination, paginationReadout } = this.r;
    const { tableData, currentPage, pageSize } = this.s;

    const pageTotal = tableData != null ? Math.max(1, Math.ceil(tableData.length / pageSize)) : 1;
    if (currentPage > pageTotal) {
      this.setCurrentPage(1);
      return;
    }
    const destinations = [
      currentPage <= 1 ? null : 1,
      currentPage <= 1 ? null : currentPage - 1,
      currentPage >= pageTotal ? null : currentPage + 1,
      currentPage >= pageTotal ? null : pageTotal
    ];
    const children = [...pagination.querySelectorAll("button")];
    children.forEach(
      /** @type {(el: HTMLElement, i: number) => void} */
      (el, index) => {
        const dest = destinations[index];
        if (dest === null) {
          el.classList.add("disabled");
          el.ariaDisabled = "true";
          el.classList.remove("interactable");
          el.setAttribute("tabindex", -1);
          if (typeof el.dataset.to !== "undefined") {
            delete el.dataset.to;
          }
        } else {
          el.classList.remove("disabled");
          el.ariaDisabled = "false";
          el.classList.add("interactable");
          el.removeAttribute("tabindex");
          if (el.dataset.to !== String(dest)) {
            el.dataset.to = String(dest);
            el.onclick = () => {
              this.setCurrentPage(dest);
              if (dest > currentPage) {
                const scrollTop = this.r.scrollContainer.scrollTop;
                const tableScroll = this.r.table.offsetTop - this.r.scrollContainer.offsetTop;
                if (scrollTop > tableScroll) {
                  setTimeout(() => this.r.scrollContainer.scrollBy(0, tableScroll - scrollTop), 0);
                }
              }
            }
          }
        }
      }
    );
    if (tableData == null) {
      paginationReadout.textContent = '';
    } else {
      paginationReadout.textContent = `${currentPage} / ${pageTotal}`;
    }
  }

  populateTable() {
    const { table } = this.r;
    const { tableData, currentPage, pageSize } = this.s;
    if (tableData == null) {
      modify(table, true, {}, [
        h("caption", {}, "Loading...")
      ]);
      return;
    }

    const { columns, indices, length, widthEstimate } = tableData;
    const rowNums = new Array(pageSize).fill(0)
      .map((_, i) => (currentPage - 1) * pageSize + i)
      .filter(n => n < length)
      .map(n => indices[n]);
    const numWidth = Math.ceil(Math.log10(1 + Math.max(1, ...rowNums)));
    const showCols = columns.filter(col => col.show);
    modify(table, true, { style: { "min-width": `${widthEstimate * 3}px` } }, [
      h('thead', {}, [
        h('tr', {},
          showCols.map((col, i) =>
            h('th', i === 0 ? { width: `${numWidth}ex` } : {}, col.label)
          )
        ),
        h('tr', {},
          showCols.map(col =>
            h('td', { class: 'text-xs text-center font-mono p-1' },
              col.section ? `${col.section}, ${col.type}` : col.type
            )
          )
        ),
      ]),
      h('tbody', {},
        rowNums.map(n =>
          h('tr', {},
            showCols.map(col =>
              h('td', { class: 'text-sm p-1' }, col.formatter(col.get(n)))
            )
          )
        )
      )
    ]);
  }

  runQuery() {
    const { query, tableData } = this.s;
    if (tableData == null) {
      return;
    }
    const { columns, deck } = tableData;

    const mask = query.reduce(
      (acc, { accessor, test }) =>
        deck.data.cards.map((_, i) => acc[i] && test(accessor(i))),
      deck.data.cards.map(() => true)
    );
    const indices = new Array(mask.length).fill(-1);
    let lengthFiltered = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        indices[lengthFiltered] = i;
        lengthFiltered += 1;
      }
    }
    const widths = indices.slice(0, lengthFiltered)
      .map((i) => columns.reduce((acc, col) => acc + Math.max(col.label.length, col.formatter(col.get(i)).length), 0))
      .sort();

    this.setTableData({
      ...tableData,
      indices,
      length: lengthFiltered,
      widthEstimate: widths.length ? widths[Math.floor(0.9 * widths.length)] : 0,
    })
  }

  calculateQuery() {
    const { tableData, queryText } = this.s;
    if (tableData == null) {
      return;
    }

    const [_, queryResult] = queryParser.parse(queryText);
    if (queryResult.kind === Result.OK) {
      const query = [];
      for (const qpart of queryResult.val) {
        const [field, ...subpath] = qpart.field.split('.');
        /** @type {{ type: keyof import('./advancedQuery').PredicateTypes }} */
        const column = tableData.columns.find((col) =>
          col.label.toLowerCase().replace(/ /g, '_').replace(/[^A-Za-z0-9_]/g, '') === field.toLowerCase()
        );
        if (column === undefined) {
          console.log('Field not found: ' + field);
          return;
        }
        let type = column.type;
        let accessor = column.get;
        if (subpath.length > 1) {
          console.log("Too deeply nested: " + qpart.field);
          return;
        }
        if (subpath.length > 0) {
          if (type === "latLng") {
            const accessorOrErr = toInteger(subpath[0]).validate("", n => n === 0 || n === 1)
              .map((n) => (i) => {
                const v = column.get(i);
                return v != null ? v[n] : null;
              });
            if (accessorOrErr.kind === Result.ERR) {
              console.log(`Not a LatLng field: .${subpath[0]}`);
              return;
            }
            type = "number";
            accessor = accessorOrErr.val;
          } else {
            console.log("Field does not exist")
          }
        }
        const testOrErr = toPredicate(qpart)[type];
        if (testOrErr.kind === Result.ERR) {
          console.log(testOrErr.msg);
          return;
        }
        query.push({ accessor, test: testOrErr.val });
      }
      this.setQuery(query);
    } else {
      console.log(queryResult.msg);
    }
  }
}

function deckColumns(deck) {
  const { cards, stat_defs: statDefs, tag_defs: tagDefs } = deck.data;
  const unpascal = (s) => s.slice(0, 1).toLowerCase() + s.slice(1);

  const categorySummary = cards.reduce((acc, { category }) => {
    if (category != null) {
      acc.count += 1;
      acc.groupCounts.set((acc.groupCounts.get(category) || 0) + 1);
    }
    return acc;
  }, { count: 0, groupCounts: new Map() });
  const formatters = {
    string: (x) => x != null ? x : "",
    date: (x) => x != null ? x.slice(0, 10) : "",
    number: (x) => x != null ? x.toLocaleString() : "",
    currency: (x) =>  x != null ? `$${x.toLocaleString()}` : "",
    latLng: (x) => x != null ? `${x[0]}, ${x[1]}` : "",
    boolean: (x) => x === true ? "true" : "",
    stringArray: (x) => x != null ? x.join(", ") : "",
  }
  const columns = [
    { label: "#", type: "", show: true, get: (i) => String(i + 1), formatter: formatters.string, },
    { label: "Card", type: "string", show: true, get: (i) => cards[i].title, formatter: formatters.string, },
    { label: "Disable?", type: "boolean", show: false, get: (i) => cards[i].is_disabled, formatter: formatters.boolean, },
    { label: "Notes", type: "string", show: false, get: (i) => cards[i].notes, formatter: formatters.string, },
    { label: "ID", type: "string", show: false, get: (i) => cards[i].unique_id, formatter: formatters.string, },
    { label: "Popularity", type: "number", show: true, get: (i) => cards[i].popularity, formatter: formatters.number, },
    { label: "Category", type: "string", show: categorySummary.count > 0, get: (i) => cards[i].category, formatter: formatters.string },
    ...tagDefs.map(e => ({
      label: e.label,
      section: "tag",
      type: "string[]",
      show: true,
      get: (i) => e.values[i],
      formatter: formatters.stringArray,
    })),
    ...statDefs.map(e => {
      return {
        label: e.label,
        section: "stat",
        type: unpascal(e.data.kind),
        show: true,
        get: (i) => e.data.values[i],
        formatter:
          e.data.kind === 'Date'
            ? formatters.date
            : e.data.kind === 'LatLng'
            ? formatters.latLng
            : e.data.kind === 'Number' && e.data.unit === 'Dollar'
            ? formatters.currency
            : e.data.kind === 'Number'
            ? formatters.number
            : formatters.string,
      };
    }),
  ];
  return [columns, categorySummary];
}

export class SheetPage {
  constructor() {
    this.r = {
      tablist: document.getElementById('tablist'),
      deckPicker: document.querySelector('#bottom-controls select'),
      errorBox: document.getElementById('error-box'),
      warningList: document.getElementById('warning-list'),
      refreshBtn: document.getElementById('refresh'),
      publishBtn: document.getElementById('publish'),
      publishContainer: document.getElementById('publish-container'),
      publishCodeblock: document.querySelector('#publish-container pre'),
    };

    this.s = {
      sheetData: null,
      tableData: null,
      currentPage: 1,
      deckName: null,
      query: [],
      queryText: '',
      pageSize: 50,
    }

    const effects = new EffectList();
    this.tableView = new PagedTableView(this.s, effects);
    this.setSheetData = effects.setter(val => { this.s.sheetData = val; });
    this.setTableData = effects.setter(val => { this.s.tableData = val; });
    this.setDeckName = effects.setter(val => { this.s.deckName = val; });
    this.setCurrentPage = effects.setter(val => { this.s.currentPage = val; });

    effects.register(this.populateWarnings.bind(this), () => [this.s.tableData]);
    effects.register(() => {
      const { sheetData } = this.s;
      if (sheetData == null) {
        return;
      }
      modify(this.r.deckPicker, true, {},
        sheetData.map(({ deck }) => h('option', {}, deck.title))
      );
    }, () => [this.s.sheetData]);
    effects.register(
      this.calculateTableData.bind(this),
      () => [this.s.deckName, this.s.sheetData]
    );

    window.addEventListener("phx:mount", () => {
      this.setupListeners();
      this.tableView.setupListeners();
    });
    // this.refresh();
  }

  setupListeners() {
    const {
      tablist,
      refreshBtn,
      deckPicker,
    } = this.r;

    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const tabPanels = [...document.querySelectorAll('#top-controls [role="tabpanel"]')];

    for (let i = 0; i < tabs.length && i < tabPanels.length; i++) {
      const tab = tabs[i];
      const tabPanel = tabPanels[i];
      const otherTabs = [...tabs.slice(0, i), ...tabs.slice(i + 1)];
      const otherTabPanels = [...tabPanels.slice(0, i), ...tabPanels.slice(i + 1)];
      const activate = () => {
        otherTabs.forEach((other) => {
          other.classList.remove('active');
          other.ariaSelected = "false";
        });
        otherTabPanels.forEach((other) => {
          other.classList.add('hidden');
        })
        tab.classList.add('active');
        tab.ariaSelected = "true";
        tabPanel.classList.remove('hidden');
      };
      tab.addEventListener('click', activate);
      if (window.location.hash === new URL(tab.href).hash) {
        activate();
      }
    }

    refreshBtn.addEventListener('click', () => {
      const { errorBox, publishContainer } = this.r;
      errorBox.classList.add('hidden');
      publishContainer.classList.add('hidden');
      this.setCurrentPage(1);
      this.setSheetData(null);
      this.setDeckName(null);
    });

    deckPicker.addEventListener('change', evt => {
      this.setDeckName(evt.target.selectedOptions[0].value);
      this.tableView.setQueryText('disable:false');
    });

    window.addEventListener('phx:load', this.handleLoad.bind(this));
  }

  populateWarnings() {
    const { warningList } = this.r;
    const warnings = this.s.tableData ? this.s.tableData.warnings : [];
    if (warnings.length) {
      warningList.classList.remove('hidden');
      modify(warningList, true, {},
        warnings.map(({ message }) => h('li', { class: 'text-sm' }, message))
      );
    } else {
      warningList.classList.add('hidden');
    }
  }

  calculateTableData() {
    const { sheetData, deckName } = this.s;
    if (!sheetData || !deckName) {
      this.setTableData(null);
      return;
    }
    /** @type {import('./client').DeckAndCallouts | null} */
    const entry = sheetData.find(d => d.deck.title === deckName);
    if (!entry) {
      this.setTableData(null);
      return;
    }
    const { deck, callouts } = entry;
    const warnings = callouts.slice();
    const [columns, categorySummary] = deckColumns(deck);
    if (categorySummary.count === 0) {
      warnings.push({
        kind: "Warning",
        message: "Category is not filled out - the game customization sliders will be disabled"
      });
    } else {
      const numCards = deck.data.cards.length;
      if (categorySummary.count < numCards) {
        warnings.push({
          kind: "Warning",
          message: `Category is blank for ${numCards - categorySummary.count} cells`
        });
      }
      categorySummary.groupCounts.forEach((v, cat) => {
        if (v < 10) {
          warnings.push({
            kind: "Warning",
            message: `Fewer than 10 cards have the primary category: ${cat}`
          });
        }
      });
      if (categorySummary.groupCounts.size > 10) {
        warnings.push({
          kind: "Warning",
          message: `There are ${categorySummary.groupCounts.size} different categories - the game customization menu only allows 10`
        });
      }
    }
    this.setTableData({
      columns,
      deck,
      indices: [],
      length: 0,
      widthEstimate: 0,
      warnings,
    });
    this.tableView.setQueryText('disable:false');
  }

  handleLoad(evt) {
    const json = evt.detail;
    const { errorBox } = this.r;
    if (json.ok) {
      this.setDeckName(json.ok[0].deck.title);
      this.setSheetData(json.ok);
    } else {
      const errorMessage = json.error || "Unknown error";
      console.error('handleLoad', errorMessage);
      errorBox.classList.remove('hidden');
      errorBox.textContent = errorMessage;
    }
  }
}

export class ExplorePage {
  constructor() {
    this.r = {
      tablist: document.getElementById('tablist'),
      deckReadout: document.getElementById('deck-readout'),
      triviaNoData: document.getElementById('trivia-nodata'),
      triviaBody: document.getElementById('trivia-body'),
    };

    this.s = {
      tableData: null,
      currentPage: 1,
      query: [],
      queryText: '',
      pageSize: 50,
      trivia: null,
    }

    const effects = new EffectList();
    this.tableView = new PagedTableView(this.s, effects);
    this.setTableData = effects.setter(val => { this.s.tableData = val; });
    this.setCurrentPage = effects.setter(val => { this.s.currentPage = val; });
    this.setTrivia = effects.setter(val => { this.s.trivia = val; });
    effects.register(() => {
      const { tableData } = this.s;
      if (tableData == null) {
        return;
      }
      this.r.deckReadout.textContent = tableData.deck.title;
    }, () => [this.s.tableData]);
    effects.register(this.renderTrivia.bind(this), () => [this.s.trivia]);

    window.addEventListener("phx:mount", () => {
      this.setupListeners();
      this.tableView.setupListeners();
    });
    window.addEventListener("phx:trivia-result", (evt) => {
      if (!evt.detail.ok) {
        console.error(evt.detail);
        this.setTrivia(null);
        return;
      }
      const { trivia } = evt.detail.ok;
      this.setTrivia(trivia);
    });
  }

  setupListeners() {
    const { tablist } = this.r;

    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const tabPanels = [...document.querySelectorAll('#top-controls [role="tabpanel"]')];

    for (let i = 0; i < tabs.length && i < tabPanels.length; i++) {
      const tab = tabs[i];
      const tabPanel = tabPanels[i];
      const otherTabs = [...tabs.slice(0, i), ...tabs.slice(i + 1)];
      const otherTabPanels = [...tabPanels.slice(0, i), ...tabPanels.slice(i + 1)];
      const activate = () => {
        otherTabs.forEach((other) => {
          other.classList.remove('active');
          other.ariaSelected = "false";
        });
        otherTabPanels.forEach((other) => {
          other.classList.add('hidden');
        })
        tab.classList.add('active');
        tab.ariaSelected = "true";
        tabPanel.classList.remove('hidden');
      };
      tab.addEventListener('click', activate);
      if (window.location.hash === new URL(tab.href).hash) {
        activate();
      }
    }

    window.addEventListener('phx:load', this.handleLoad.bind(this));
  }

  calculateTableData(deck) {
    const [columns, _] = deckColumns(deck);
    this.setTableData({
      columns,
      deck,
      indices: [],
      length: 0,
      widthEstimate: 0,
    });
    this.tableView.setQueryText('disable:false');
  }

  handleLoad(evt) {
    const json = evt.detail;
    // const { errorBox } = this.r;
    if (json.ok) {
      this.calculateTableData(json.ok);
    } else {
      const errorMessage = json.error || "Unknown error";
      console.error('handleLoad', errorMessage);
      // errorBox.classList.remove('hidden');
      // errorBox.textContent = errorMessage;
    }
  }

  renderTrivia() {
    const { triviaBody, triviaNoData } = this.r;
    const { trivia } = this.s;

    if (triviaNoData) {
      triviaNoData.style.display = 'none';
    }
    if (trivia == null) {
      modify(triviaBody, true, {}, []);
      return;
    }
    if (trivia.questionValueType === "number[]") {
      const questionValue = [];
      for (const o of [...trivia.options, ...(trivia.prefilledAnswers || [])]) {
        for (const i of o.questionValue) {
          while (i >= questionValue.length) questionValue.push('');
          questionValue[i] = o.answer;
        }
      }
      trivia.options = [{ answer: "", id: 0, questionValue: questionValue.join("") }];
    }
    if (trivia.questionValueType === "date") {
      if (trivia.statAnnotation && trivia.statAnnotation.axisMod === "age") {
        trivia.options = trivia.options.map(e => ({ ...e, questionValue: relativeDeltaToNow(new Date(e.questionValue))[0] }));
      } else {
        trivia.options = trivia.options.map(e => ({ ...e, questionValue: new Date(e.questionValue).toLocaleString() }));
      }
    }
    if (trivia.questionValueType === "number") {
      if (trivia.statAnnotation && trivia.statAnnotation.axisMod === "distance") {
        trivia.options = trivia.options.map(e => ({ ...e, questionValue: `${Math.round(e.questionValue * 0.621371)} mi` }));
      } else {
        trivia.options = trivia.options.map(e => ({ ...e, questionValue: e.questionValue.toLocaleString() }));
      }
    }
    trivia.options.sort(() => Math.random() - 0.5);
    let ul = null;
    modify(triviaBody, true, {}, [
      h("p", { class: "text-center" }, trivia.question),
      h("ul", { $ref: (el) => ul = el }, trivia.options.map((e, i) =>
        h("li", { class: "flex flex-wrap" }, [
          h("div", {}, e.answer.replace(/\n/g, ' · ')),
          h("span", { class: "flex-grow" }),
          i === 0 && h(
            "button",
            {
              class: "interactable bg-gray text-white text-sm",
              style: { padding: '1px 0.25rem' },
              onClick: () => {
                if (ul == null) return;
                const children = [...ul.querySelectorAll('li')];
                if (children.length !== trivia.options.length) return;
                children[0].querySelector("button").remove();
                children.forEach((child, i) => {
                  child.insertAdjacentText('beforeend', String(trivia.options[i].questionValue));
                });
              },
            },
            "reveal"
          ),
        ])
      ))
    ]);
  }
}
