import { EffectList, h, modify, prettyPrint } from "./utils";

export class SheetAdvancedPage {
  constructor() {
    this.r = {
      titleEl: document.getElementById('sheet-title'),
      errorBox: document.getElementById('error-box'),
      passwordInput: document.getElementById('deck-editor-pw'),
      refreshBtn: document.getElementById('refresh'),
      publishBtn: document.getElementById('publish'),
      publishContainer: document.getElementById('publish-container'),
      publishCodeblock: document.querySelector('#publish-container pre'),
      tabContainer: document.getElementById('tab-container'),
      editorContainer: document.getElementById('deck-editor-container'),
    };

    this.s = {
      refreshEnabled: true,
      publishEnabled: true,
      decks: [],
      deckEditors: [],
      activeTab: -1,
    }

    const effects = new EffectList();
    this.setDecks = effects.setter(val => { this.s.decks = val; });
    this.setActiveTab = effects.setter(val => { this.s.activeTab = val; });

    effects.register(this.addTextEditors.bind(this), () => [this.s.decks]);
    effects.register(this.activateTab.bind(this), () => [this.s.activeTab]);

    this.setupListeners();
    this.refresh();
  }

  setupListeners() {
    const {
      refreshBtn,
      publishBtn,
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
  }

  activateTab() {
    const { activeTab } = this.s;
    const { editorContainer, tabContainer } = this.r;
    const tabs = [...tabContainer.children].map(e => e.firstChild);
    const editors = [...editorContainer.children];
    for (let i = 0; i < tabs.length && i < editors.length; i++) {
      if (activeTab === i) {
        tabs[i].classList.add('active')
        editors[i].classList.remove('hidden')
      } else {
        tabs[i].classList.remove('active')
        editors[i].classList.add('hidden')
      }
    }
  }

  addTextEditors() {
    const { deckEditors, decks } = this.s;
    const { editorContainer, tabContainer } = this.r;
    const previous = [...editorContainer.querySelectorAll('textarea')];
    for (let i = 0; i < previous.length && i < deckEditors.length; i++) {
      previous[i].removeEventListener('change', deckEditors[i].listener);
    }
    deckEditors.splice(0);
    const newChildren = [];
    const newTabs = [];
    for (let d of decks) {
      const index = newTabs.length;
      const { title, id } = d;
      const editor = { id, value: localStorage.getItem(`sheetAdvanced__${title}`) || '' }
      editor.listener = (ev) => {
        editor.value = ev.target.value;
        localStorage.setItem(`sheetAdvanced__${title}`, ev.target.value);
      }
      newTabs.push(h('li', { className: 'flex-1 mx-1' },
        h('button', { className: 'h-full w-full bg-surface tab', onClick: () => this.setActiveTab(index), }, title)
      ));
      newChildren.push(
        h('div', { className: 'mt-8 hidden', style: { height: '80vh' } }, [
          h(
            'textarea',
            {
              className: 'border border-blue-500 bg-surface json',
              onChange: editor.listener
            },
            editor.value
          ),
        ])
      )
      deckEditors.push(editor);
    }
    modify(editorContainer, true, {}, newChildren);
    modify(tabContainer, true, {}, newTabs);
    if (decks.length) {
      this.setActiveTab(0);
    } else {
      this.setActiveTab(-1);
    }
  }

  setTitle(title) {
    modify(this.r.titleEl, true, {}, [title]);
  }

  async refresh() {
    this.s.refreshEnabled = false;
    const { errorBox, titleEl, publishContainer } = this.r;
    titleEl.textContent = "Loading decks...";
    errorBox.classList.add('hidden');
    publishContainer.classList.add('hidden');

    try {
      const response = await fetch(window.apiRoutes.deckList);
      const json = await response.json();
      if (json.error) {
        throw new Error(json.error);
      } else {
        this.setTitle('Edit pairings, trivia defs, images');
        this.setDecks(json);
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
    const { passwordInput, publishCodeblock, publishContainer, errorBox } = this.r;
    errorBox.classList.add('hidden');
    const { activeTab, deckEditors } = this.s;
    if (activeTab < 0 || activeTab >= deckEditors.length) return;
    const editor = deckEditors[activeTab];

    try {
      const content = JSON.parse(editor.value);
      const body = JSON.stringify({ password: passwordInput.value, content });
      this.s.publishEnabled = false;
      const resp = await fetch(`${window.apiRoutes.deckUpdate}${editor.id}`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });
      const json = await resp.json();
      console.log(json);
      publishContainer.classList.remove('hidden');
      publishCodeblock.textContent = prettyPrint(json);
    } catch (err) {
      errorBox.classList.remove('hidden');
      errorBox.textContent = err;
    } finally {
      this.s.publishEnabled = true;
    }
  }
}