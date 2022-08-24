import { EffectList, h, modify, prettyPrint } from "./utils";

export class SheetPage {
  constructor() {
    this.r = {
      titleEl: document.getElementById('sheet-title'),
      controls: document.getElementById('control-container'),
      controlSwitcher: document.querySelector('#control-container button'),
      searchInput: document.querySelector('#control-container input'),
      pagination: document.querySelector('#control-container nav ul'),
      deckPicker: document.querySelector('#control-container select'),
      errorBox: document.getElementById('error-box'),
      warningList: document.getElementById('warning-list'),
      table: document.getElementById('sheet-table'),
      refreshBtn: document.getElementById('refresh'),
      publishBtn: document.getElementById('publish'),
      publishContainer: document.getElementById('publish-container'),
      publishCodeblock: document.querySelector('#publish-container pre'),
    };

    this.s = {
      refreshEnabled: true,
      publishEnabled: true,
      sheetData: null,
      tableData: null,
      currentPage: 1,
      deckName: null,
      query: '',
      pageSize: 50,
    }

    const effects = new EffectList();
    this.setSheetData = effects.setter(val => { this.s.sheetData = val; });
    this.setTableData = effects.setter(val => { this.s.tableData = val; });
    this.setCurrentPage = effects.setter(val => { this.s.currentPage = val; });
    this.setDeckName = effects.setter(val => { this.s.deckName = val; });
    this.setQuery = effects.setter(val => {
      this.s.query = val;
      this.r.searchInput.value = val;
    });

    effects.register(this.repaginate.bind(this), () => [this.s.tableData, this.s.currentPage]);
    effects.register(this.populateTable.bind(this), () => [this.s.tableData, this.s.currentPage]);
    effects.register(
      this.calculateTableData.bind(this),
      () => [this.s.deckName, this.s.sheetData, this.s.query]
    );
    
    effects.register(() => {
      const { sheetData } = this.s;
      if (sheetData == null) {
        return;
      }
      modify(this.r.deckPicker, true, {},
        sheetData.decks.map(d => h('option', { value: d.title }, d.title.replace('Deck:', '', 1)))
      );
    }, () => [this.s.sheetData]);

    this.setupListeners();
    this.refresh();
  }

  setupListeners() {
    const {
      refreshBtn,
      publishBtn,
      deckPicker,
      controlSwitcher,
      searchInput
    } = this.r;
    refreshBtn.addEventListener('click', () => {
      if (this.s.refreshEnabled) {
        this.refresh();
      }
    });

    publishBtn.addEventListener('click', () => {
      if (this.s.publishEnabled) {
        this.publish();
      }
    });

    deckPicker.addEventListener('change', evt => {
      this.setDeckName(evt.target.selectedOptions[0].value);
      this.setQuery('');
    });

    controlSwitcher.addEventListener('click', () => {
      if (Array.from(searchInput.classList).includes('hidden')) {
        controlSwitcher.textContent = '☰'
      } else {
        controlSwitcher.textContent = '🔍'
      }
      searchInput.classList.toggle('hidden');
      deckPicker.classList.toggle('hidden');
    });

    searchInput.addEventListener('input', evt => {
      this.setQuery(evt.target.value);
      this.setCurrentPage(1);
    });
  }

  repaginate() {
    const { pagination } = this.r;
    const { tableData, currentPage, pageSize } = this.s;
    if (tableData == null) return;

    const pageTotal = Math.ceil((tableData.length - 1) / pageSize);

    const getMiddle = n => {
      switch (n) {
        case 1: return [n + 1, n + 2].filter(x => x < pageTotal);
        case 2: return [n, n + 1, n + 2].filter(x => x < pageTotal);
        case pageTotal - 1: return [n - 2, n - 1, n].filter(x => x > 1);
        case pageTotal: return [n - 2, n - 1].filter(x => x > 1);
        default: return [n - 1, n, n + 1];
      }
    };

    const pages = getMiddle(currentPage);
    if (pages[0] > 1) {
      if (pages[0] > 2) {
        pages.unshift('...')
      }
      pages.unshift(1);
    }
    if (pages[pages.length - 1] < pageTotal) {
      if (pages[pages.length - 1] < pageTotal - 1) {
        pages.push('...');
      }
      pages.push(pageTotal);
    }

    const oldPageLinks = {};
    const separators = {};
    Array.from(pagination.children).forEach((child, i) => {
      if (child.textContent === '...') {
        const which = i === 1 ? 'left' : 'right';
        separators[which] = child;
      } else {
        oldPageLinks[child.textContent] = child;
      }
    });
    pagination.replaceChildren(
      ...pages.map((pg, i) => {
        if (pg === '...') {
          const which = i === 1 ? 'left' : 'right';
          return separators[which] || h('span', { style: { margin: '0 0.25rem' } }, '...');
        }
        const attrs = {
          active: pg === currentPage,
          class: 'interactable',
          onClick: () => {
            this.setCurrentPage(pg);
          },
        };
        if (String(pg) in oldPageLinks) {
          if (pg === currentPage) {
            oldPageLinks[String(pg)].querySelector('button').setAttribute('active', '');
          } else {
            oldPageLinks[String(pg)].querySelector('button').removeAttribute('active');
          }
        }
        return oldPageLinks[String(pg)] || h('li', {}, h('button', attrs, pg));
      })
    );
  }

  populateTable() {
    const { warningList, table } = this.r;
    const { tableData, currentPage, pageSize } = this.s;
    if (tableData == null) {
      modify(table, true, {}, []);
      warningList.classList.add('hidden');
      return;
    }

    const { deck, warnings } = tableData;
    if (warnings.length) {
      warningList.classList.remove('hidden');
      modify(warningList, true, {},
        warnings.map(txt => h('li', { class: 'text-sm' }, txt))
      );
    } else {
      warningList.classList.add('hidden');
    }
    const rowNums = new Array(pageSize).fill(0)
      .map((_, i) => (currentPage - 1) * pageSize + i)
      .filter(e => e < tableData.length);
    modify(table, true, {}, [
      h('thead', {},
        deck.map(col =>
          h('th', {}, col.name)
        )
      ),
      h('tbody', {},
        rowNums.map(n =>
          h('tr', {},
            deck.map(({ rows }) =>
              h('td', { class: 'text-sm p-1' }, n < rows.length ? rows[n] : '')
            )
          )
        )
      )
    ]);
  }

  calculateTableData() {
    const { sheetData, deckName, query } = this.s;
    if (!sheetData || !deckName) {
      this.setTableData(null);
      return;
    }
    const deck = sheetData.decks.find(d => d.title === deckName);
    if (!deck) {
      this.setTableData(null);
      return;
    }

    const warnings = [];
    const first = (arr) => arr.length ? arr[0] : null;
    const tagLabelPos = deck.values.findIndex((col, i, arr) =>
      first(col) === 'Column' && i + 1 < arr.length && first(arr[i + 1]) === 'Label'
    );
    const tagLabels = {};
    if (tagLabelPos !== -1) {
      const kCol = deck.values[tagLabelPos];
      const vCol = deck.values[tagLabelPos + 1];
      for (let i = 1; i < Math.min(kCol.length, vCol.length); i++) {
        if (/^(Category|Tag|Stat)/.test(kCol[i]) && vCol[i]) {
          tagLabels[kCol[i]] = vCol[i];
        }
      }
    } else {
      warnings.push("Tags don't have labels")
    }
    const showCols = [];
    const disabledRows = new Set();
    const disableMapCol = deck.values.find(col => col[0] === 'Disable?');
    if (disableMapCol !== undefined) {
      disableMapCol.forEach((e, i) => {
        if (e && i > 0) disabledRows.add(i - 1);
      });
    } else {
      warnings.push("No column named 'Disable?'");
    }
    const filteredRows = new Set();
    let stopAtCol = deck.values.findIndex(col => first(col) === null);
    if (stopAtCol === -1) {
      stopAtCol = deck.values.length;
      warnings.push("Couldn't find blank column to end main section");
    }
    if (query) {
      const queryL = query.toLowerCase();
      for (const col of deck.values.slice(0, stopAtCol)) {
        if (col.length > 1 && col[0] !== 'Disable?' && col[0] !== 'ID') {
          col.forEach((cell, i) => {
            if (i > 0 && cell.toLowerCase().includes(queryL)) {
              filteredRows.add(i - 1);
            }
          });
        }
      }
    }

    let longCol = [];
    let numRows = 0;
    let popColCount = null;
    let cardColCount = null;
    const tagColCounts = {};
    const statColTypes = {};
    const countOccurrences = (acc, cur, i) => {
      if (cur !== '' && !disabledRows.has(i)) {
        acc.total += 1;
        acc.grouped[cur] = (acc.grouped[cur] || 0) + 1;
      }
      return acc;
    };
    const countTagOccurrences = (acc, cur, i) => {
      if (cur !== '' && !disabledRows.has(i)) {
        acc.total += 1;
        const tagList = cur.split(/\s*,\s*/);
        for (const tag of tagList) {
          acc.grouped[tag] = (acc.grouped[tag] || 0) + 1;
        }
        acc.multi = acc.multi || tagList.length > 1;
      }
      return acc;
    };
    const inferType = (str) => {
      if (str === '')
        return 'empty';
      else if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(str))
        return 'date';
      else if (/^\$[0-9.,]+$/.test(str))
        return 'dollar_amount';
      else if (str.includes(' ') || Number.isNaN(parseFloat(str, 10)))
        return 'string';
      
      return 'number';
    }
    const countTypes = (acc, cur, i) => {
      if (!disabledRows.has(i)) {
        const typ = inferType(cur);
        acc[typ] = (acc[typ] || 0) + 1;
      }
      return acc;
    };
    for (const col of deck.values.slice(0, stopAtCol + 1)) {
      if (col.length > 1 && col[0] !== 'Disable?' && col[0] !== 'ID') {
        const colRep = {
          name: tagLabels[col[0]] || col[0],
          rows: col.slice(1).filter((_, i) =>
            !disabledRows.has(i) && (!query || filteredRows.has(i))
          ),
        };
        showCols.push(colRep);
        if (col.length > longCol.length) {
          longCol = col;
          numRows = colRep.rows.length;
        }
        if (/^(Category|Tag|Stat)/.test(col[0])) {
          if (!tagLabels[col[0]]) {
            warnings.push(`Column '${col[0]}' needs a descriptive label`);
          }
          if (col[0].startsWith('Tag') || col[0].startsWith('Category')) {
            tagColCounts[col[0]] = col.slice(1).reduce(countTagOccurrences, {
              total: 0,
              grouped: {},
              multi: false
            });
          } else {
            statColTypes[col[0]] = col.slice(1).reduce(countTypes, {});
          }
        } else if (col[0] === 'Popularity') {
          popColCount = col.slice(1).reduce(countTypes, {});
        } else if (col[0] === 'Card') {
          cardColCount = col.slice(1).reduce(countOccurrences, {
            total: 0,
            grouped: {},
          });
        }
      }
    }
    const enabledCount = longCol.length - 1 - disabledRows.size;
    if (!cardColCount) {
      warnings.unshift("Error: column 'Card' is required");
    } else {
      if (cardColCount.total < enabledCount) {
        warnings.push(
          `Column 'Card' is blank for ${enabledCount - cardColCount.total} cells - ` +
          'these will be dropped'
        );
      }
      Object.entries(cardColCount.grouped).filter(([, v]) => v > 1).forEach(([card, c]) => {
        warnings.push(`Card value '${card.replace(/\n/g, "⮐")}' appears ${c} times`);
      });
    }
    if (!popColCount) {
      warnings.push("Column 'Popularity' is not filled out");
    } else {
      if (popColCount['empty'] > 0) {
        warnings.push(
          `Column 'Popularity' is blank for ${popColCount['empty']} cells - ` +
          'these will be treated as zeros'
        );
      }
      const nanPop = Object.entries(popColCount)
        .filter(([k, v]) => k !== 'empty' && k !== 'number' && v !== 0);
      nanPop.forEach(([k, v]) => {
        warnings.push(
          `Column 'Popularity' is a ${k} for ${v} cells - ` +
          'these will be treated as zeros'
        );
      });
    }
    if (!tagColCounts['Category1']) {
      warnings.push("Column 'Category1' is not filled out - the game customization sliders will be disabled");
    } else {
      const counts1 = tagColCounts['Category1'];
      if (counts1.multi) {
        warnings.push("Column 'Category1' should not have multiple values in any cell");
      }
      if (counts1.total < enabledCount) {
        warnings.push(
          `Column 'Category1' is blank for ${enabledCount - counts1.total} cells`
        );
      }
      const smallGroups = [];
      Object.entries(counts1.grouped).forEach(([cat, size]) => {
        if (size < 10) {
          smallGroups.push(cat);
        }
      });
      smallGroups.forEach(cat => {
        warnings.push(`Fewer than 10 cards have the primary category: ${cat}`);
      });
      const gCount = Object.keys(counts1.grouped).length;
      if (gCount > 10) {
        warnings.push(
          `Column 'Category1' has ${gCount} categories - the game customization menu only allows 10`
        );
      }
    }
    this.setTableData({
      deck: showCols,
      length: numRows,
      warnings,
    });
  }

  async refresh() {
    this.s.refreshEnabled = false;
    const { controls, errorBox, titleEl, publishContainer } = this.r;
    titleEl.textContent = "Loading sheet...";
    errorBox.classList.add('hidden');
    controls.classList.add('hidden');
    publishContainer.classList.add('hidden');
    this.setSheetData(null);
    this.setCurrentPage(1);
    this.setDeckName(null);
    this.setQuery('');

    try {
      const id = new URL(window.location).searchParams.get('id');
      if (id == null) {
        window.location = window.pageRoutes.index;
      }
      const response = await fetch(`${window.apiRoutes.show}${id}`);
      const json = await response.json();
      if (json.error) {
        throw new Error(json.error);
      } else {
        controls.classList.remove('hidden');
        titleEl.textContent = json.title;
        this.setDeckName(json.decks[0].title);
        this.setSheetData(json);
      }
    } catch (err) {
      errorBox.classList.remove('hidden');
      titleEl.textContent = 'Error';
      errorBox.textContent = err;
    } finally {
      this.s.refreshEnabled = true;
    }
  }

  async publish() {
    const { publishCodeblock, publishContainer } = this.r;
    const { sheetData } = this.s;
    if (sheetData == null) return;

    try {
      this.s.publishEnabled = false;
      const resp = await fetch(window.apiRoutes.create, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sheetData),
      });
      const json = await resp.json();
      console.log(json);
      publishContainer.classList.remove('hidden');
      publishCodeblock.textContent = prettyPrint(json);
    } catch (err) {
      console.error(err);
    } finally {
      this.s.publishEnabled = true;
    }
  }
}