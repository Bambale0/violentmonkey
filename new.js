// ==UserScript==
// @name        Скрипт мой API
// @namespace   Скрипт тесты
// @include     /^https:\/\/lms\.mti\.moscow\/assessments\/training\/\d+\/\d+\/\d+\/\d+/
// @include     /^https:\/\/lms\.synergy\.ru\/assessments\/training\/\d+\/\d+\/\d+\/\d+/
// @version     1.1
// @author      me
// @description 29.12.2024, 17:42:54
// @run-at      document-start
// @grant       unsafeWindow
// @grant       GM_xmlhttpRequest
// @inject-into page
// ==/UserScript==

const $$ = (sel, par = document) => [...par.querySelectorAll(sel)];
const $ = (sel, par) => $$(sel, par)[0];
const on = (el, evt, cb) => el.addEventListener(evt, cb);
const cancel = e => ['stopPropagation', 'preventDefault'].reduce((e, p) => (e[p](), e), e);
const _ = obj => {
  if (Array.isArray(obj)) return obj.map(_);
  if (obj instanceof Element) return obj;
  let el = document.createElement(obj.tag ?? 'div');
  if (obj?.cls) Array.isArray(obj.cls) ? obj.cls.map(cls => el.classList.add(cls)) : (el.className = obj?.cls);
  if (obj?.css) Object.assign(el.style, obj.css);
  if (obj?.attr) Object.entries(obj?.attr).map(([attr, val]) => el.setAttribute(attr, val));
  if (obj?.prop) Object.assign(el, obj?.prop);
  'append|prepend|before|after'.split('|').map(fn => obj?.[fn]?.[fn]?.(el));
  if (obj?.on) Object.entries(obj?.on).map(([evt, cb]) => on(el, evt, cb));
  if (obj?.text) el.innerText = obj?.text;
  if (obj?.html) el.innerHTML = obj?.html;
  if (obj?.children)
    _([obj?.children])
      .flat()
      .map(sub => el.append(sub));
  return el;
};

const AssistantHelper = {
  QUESTION_TYPES: new Map([
    [
      'Одиночный выбор',
      {
        description: 'Выберите один наиболее правильный ответ из нескольких предложенных вариантов ответов на вопрос.',
        getAnswers() {
          return AssistantHelper.parseAnswerVariants();
        },
        findImages() {
          return [...AssistantHelper.findQuestionImages(), ...AssistantHelper.findVariantsImages()];
        },
      },
    ],
    [
      'Множественный выбор',
      {
        description: 'Выберите несколько правильных ответов из предложенных вариантов ответов на вопрос.',
        getAnswers() {
          return AssistantHelper.parseAnswerVariants();
        },
        findImages() {
          return [...AssistantHelper.findQuestionImages(), ...AssistantHelper.findVariantsImages()];
        },
      },
    ],
    [
      'Текcтовый ответ',
      {
        description: 'Вставьте пропущенное слово или определите необходимый соответствующий вопросу термин.',
        getAnswers() {
          return [];
        },
        findImages() {
          return [...AssistantHelper.findQuestionImages()];
        },
      },
    ],
    [
      'Сопоставление',
      {
        description: 'Сгруппируйте элементы в пары так, чтобы левый элемент в каждой паре соответствовал правому.',
        getAnswers() {
          let answers = $$('#player-assessments-form ul li > div').map(div => {
            let marker = $('p', div).innerText.trim().replace(/\.$/, '');
            let answer = $('div ', div).innerText.trim();
            return { marker, answer };
          });
          if(answers.length) return answers;
          return $$('.test-answers').map(div => {
            let divs = $$('div', div);
            let marker = divs[0].innerText.trim().replace(/\.$/, '');
            let answer = divs[1].innerText.trim();
            return { marker, answer };
          });
        },
        findImages() {
          return [...AssistantHelper.findQuestionImages(), ...AssistantHelper.findComparisonImages()];
        },
      },
    ],
    [
      'Сортировка',
      {
        description: 'Расставьте предложенные ответы в правильном порядке в соответствии с вопросом.',
        getAnswers() {
          return $$('#player-assessments-form .ui-sortable > div').map(div => {
            let marker = $('span.order-counter', div).innerText.trim();
            let answer = $('span.order-counter ~ div ', div).innerText.trim();
            return { marker, answer };
          });
        },
        findImages() {
          return [...AssistantHelper.findQuestionImages(), ...AssistantHelper.findSortingImages()];
        },
      },
    ],
  ]),
  init() {
    let initInterval = setInterval(() => {
      if (document.querySelector('#player form')) {
        clearInterval(initInterval);
        this.onReady();
      }
    }, 500);
  },
  async onReady() {
    this.createCockpit();
    this.createStyle();
    this.parseQuestionType();
    let qt = this.QUESTION_TYPES.get(this.questionType);
    if (qt.findImages().filter(Boolean).length) {
      $('.question-method [type=radio][value=image]', this.cockpit).checked = true;
      this.makeScreenshot();
    }
    this.question = this.parseQuestion();
    this.answers = qt.getAnswers();
    this.requestText = this.makeText();
    this.messageTextarea.value = this.requestText;
    await this.sendRequest(this.messageTextarea.value);
    switch(this.questionType){
      case 'Одиночный выбор':
        this.answers[parseInt(this.responseContent.replace(/\D/g,''))-1].input.click();
        break;
      case 'Множественный выбор':
        this.responseContent.split(/\D/g).filter(Boolean).map(num=>(this.answers[parseInt(num)-1].input.checked = true, num));
        break;
      case 'Сопоставление':
        break;
      case 'Сортировка':
        break;
      case 'Текcтовый ответ':
        $('#answers-').innerHTML = this.responseContent.replace(/\\boxed\{([^}]+)\}/,'$1');
    }
  },

  createStyle() {
    _({
      tag: 'style',
      append: document.head,
      html: `
.palette{width:30%;height:100vh;float:right;background:#0000;box-sizing:border-box}
.cockpit{position:fixed;width:30%;height:100vh;right:0;top:0;background:#0002;border-left:1px solid #000;box-sizing:border-box;padding:0.5rem}
.question-method{display:grid;grid-template-columns:1fr 1fr;text-align:center;height:2.5rem;line-height:2.5rem;margin-bottom:0.5rem}
.question-method label:first-child{border-radius:0.5rem 0 0 0.5rem}
.question-method label:last-child{border-radius:0 0.5rem 0.5rem 0}
.question-method label:has(:checked){border:1px solid #000;background:#fff;box-shadow:inset 0 0.1rem 0.1rem #000}
.question-method label:not(:has(:checked)){border:0;background:#0002}
.question-method input{display:none}
.question-method label:hover{border:1px solid #000;background:#fff}
.question-method ~ [data-question-method]{display:none}
.question-method:has([value=text]:checked) ~ [data-question-method=text],.question-method:has([value=image]:checked) ~ [data-question-method=image]{display:block}
.message-for-send{width:100%;height:calc(50vh - 4rem);display:block}
.send-message{width:100%;display:block;margin:0.5rem 0}
.image-actions{grid-template-columns:4rem 1fr;display:grid;gap:0.5rem;padding:0.5rem 0}
.image-actions button{background:transparent;border:1px solid #888}
.image-actions button:hover{background:#fff;border:1px solid red}
.communication-log{width:100%;height:calc(50vh - 4rem);resize:vertical;overflow-y:scroll;background:#fff;border:1px solid #000}
.communication-log .request,.communication-log .response{color:#fff;font-size:0.8rem;max-width:calc(100% - 2rem);padding:1em}
.communication-log .request{background:#563444;border-radius:0.5rem;margin:0.5rem 0}
.communication-log .response{background:#cf9d38;border-radius:0.5rem;margin:0.5rem 0}
`
    });
  },

  createCockpit() {
    let page = $('#page');
    _({ cls: 'palette', before: page });
    this.cockpit = _({
      cls: 'cockpit',
      before: page,
      children: [
        {
          cls: 'question-method',
          children: [
            { tag: 'label', children: [{ tag: 'input', attr: { type: 'radio', name: 'question-method', value: 'text', checked: true } }, { tag: 'span', text: 'Текстовый вопрос' }] },
            { tag: 'label', children: [{ tag: 'input', attr: { type: 'radio', name: 'question-method', value: 'image' } }, { tag: 'span', text: 'Вопрос с картинкой' }] },
          ],
        },
        { cls: 'question-details', attr: { 'data-question-method': 'text' }, children: [ { children: { tag: 'textarea', cls: 'message-for-send' } }, { tag: 'button', cls: 'send-message', text: '📄 Отправить ассистенту', on: { click: e => { cancel(e); this.sendRequest(this.messageTextarea.value); } } } ] },
        { cls: 'question-details', attr: { 'data-question-method': 'image' }, children: [ { children: { tag: 'canvas', css: { display: 'block', width: '100%' } } }, { cls: 'image-actions', children: [ { tag: 'button', title: 'Переделать', text: '📸' }, { tag: 'button', text: '🏞 Отправить картинку' } ] } ] },
        { cls: 'communication-log' },
      ],
    });
    this.messageTextarea = $('.message-for-send', this.cockpit);
    let formRect = document.forms[0].getBoundingClientRect();
    this.formCanvas = $('canvas', this.cockpit);
    this.formCanvas.setAttribute('width', formRect.width);
    this.formCanvas.setAttribute('height', formRect.height);
    this.communicationLog = $('.communication-log', this.cockpit);
    $('#footer', page)?.remove();
    $('#header', page)?.remove();
    $('#top-menu', page)?.remove();
    $('#breadcrumbs', page)?.remove();
    $('.curators-and-accounts', page)?.remove();
  },

  logResponse(response) {
    _({ tag: 'pre', cls: 'response', html: response, append: this.communicationLog });
  },

  logRequest(request) {
    _({ tag: 'pre', cls: 'request', html: request, append: this.communicationLog });
  },

  parseQuestionType() {
    this.questionType = document.forms[0].querySelector('div.clear ~ span ~ span')?.innerText.split('•').map(x => x.trim())[0] || 'Одиночный выбор';
  },

  findQuestionImages() {
    return $$('img', $('#player-assessments-form > span + span > p')) || [];
  },

  findVariantsImages() {
    return $$('div.test-answers img', $('#player-assessments-form > div.clear ~ span ~ span ~ div:has(.test-answers)')) || [];
  },

  findSortingImages() {
    return $$('#player-assessments-form .ui-sortable > div').map(div => $$('img', $('span.order-counter + div', div))) || [];
  },

  findComparisonImages() {
    return $$('#player-assessments-form ul li > div').map(div => $('img', $('div ', div))) || [];
  },

  parseQuestion() {
    let questionElements = $$('#player-assessments-form > span + span > p');
    let text = '';
    for(let questionElement of questionElements){
      text += questionElement.innerHTML.trim() + '\n\n';
    }
    return text;
  },

  parseAnswerVariants() {
    let variantParent = $('#player-assessments-form > div.clear ~ span ~ span ~ div:has(.test-answers)');
    let answerVariants = $$('div.test-answers', variantParent).map((div, index) => {
      let input = $('input', div);
      let label = $('label', div);
      let marker = index + 1;
      let answer = label.innerText.trim();
      let value = input.getAttribute('value');
      return { marker, answer, value, input };
    });
    return answerVariants;
  },

  makeText() {
    let text = `Вопрос:\n${this.question}\n\nТип вопроса: ${this.questionType}.\n\n${this.QUESTION_TYPES.get(this.questionType).description}\n`;
    if (this.answers?.length) {
      if (this.questionType == 'Одиночный выбор' || this.questionType == 'Множественный выбор') {
        text += `\nВарианты ответов:\n`;
      } else if(this.questionType == 'Сопоставление' || this.questionType == 'Сортировка') {
        text += `\nДанные:\n`;
      }
      for (let i = 0; i < this.answers.length; i++) {
        let { marker, answer } = this.answers[i];
        text += `${marker}. ${answer}\n`;
      }
    }
    return text;
  },

  async sendRequest(content) {
    console.log('=== НАЧАЛО ЗАПРОСА ===');
    this.logRequest(content);
    try{
      console.log('Отправка запроса к OpenRouter...');
      let response = new Promise((res, rej) => {
        let request = GM_xmlhttpRequest({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': "Bearer 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",
          },
          url: 'https://openrouter.ai/api/v1/chat/completions',
          overrideMimeType: 'application/json',
          responseType: 'json',
          timeout: 12e4,
          data: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: [
                  {
                    text: 'Отвечайте на каждый поставленный вопрос без ошибок. Типы: текстовый ответ, одиночный выбор, множественный выбор, сортировка, сопоставление.\n\nФормат ответа:\n- Текстовый ответ: короткое слово/предложение\n- Одиночный выбор: номер (1, 2, 3...)\n- Множественный выбор: номера через запятую (1, 2, 4)\n- Сортировка: последовательность (1, 3, 2, 4)\n- Сопоставление: пары (A-E, B-D, C-F)',
                    type: 'text',
                  },
                ],
              },
              {
                role: 'user',
                content: [{ type: 'text', text: content }],
              },
            ],
            model: 'openai/gpt-4o-mini',
          }),
          onload: response => {
            console.log('=== ОТВЕТ ПОЛУЧЕН ===', response);
            res(response);
          },
          onloadend: response => res(response),
          onerror: response => {
            console.error('=== ОШИБКА ===', response);
            rej(response);
          },
          ontimeout: response => {
            console.error('=== ТАЙМАУТ ===');
            rej(response);
          },
          onabort: response => {
            console.error('=== ПРЕРВАНО ===');
            rej(response);
          },
        });
        console.log('GM_xmlhttpRequest отправлен:', request);
      });
      response = await response;
      console.log(response);
      console.log(response.response);
      console.log(response.response.choices);
      this.logResponse(response.response.choices[0].message.content.replace(/\\boxed\{([^}]+)\}/,'$1'));
      this.responseContent = response.response.choices[0].message.content;
      return this.responseContent;
    }
    catch(error){
      console.error('=== ОШИБКА В sendRequest ===', error);
      this.logResponse('ОШИБКА: ' + error.message);
    }
  },

  makeScreenshot(element) {
    navigator.mediaDevices.getDisplayMedia({ video: true, displaySurface: 'browser' }).then(stream => {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      video.onloadedmetadata = async () => {
        const rect = element.getBoundingClientRect();
        const canvas = this.formCanvas;
        const context = canvas.getContext('2d');
        canvas.width = rect.width;
        canvas.height = rect.height;
        context.drawImage(video, rect.left, rect.top, rect.width, rect.height, 0, 0, rect.width, rect.height);
        stream.getTracks().forEach(track => track.stop());
      };
    });
  },
};

AssistantHelper.init();
