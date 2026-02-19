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
                        return {
                            marker,
                            answer
                        };
                    });
                    if (answers.length) return answers;
                    return $$('.test-answers').map(div => {
                        let divs = $$('div', div);
                        let marker = divs[0].innerText.trim().replace(/\.$/, '');
                        let answer = divs[1].innerText.trim();
                        return {
                            marker,
                            answer
                        };
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
                        return {
                            marker,
                            answer
                        };
                    });
                },
                findImages() {
                    return [...AssistantHelper.findQuestionImages(), ...AssistantHelper.findSortingImages()];
                },
            },
        ],
    ]),
    init() {
        // unsafeWindow
        // window
        // globalThis
        // Object.defineProperty(window, 'fetch', {
        //   value: url => {
        //     console.warn(`Trying to call URL: ${url}`);
        //   },
        // });
        // Object.defineProperty(window, 'XMLHttpRequest', {
        //   value: class {
        //     open(method, url) {
        //       console.warn(`Trying to call URL: (${method}) ${url}`);
        //     }
        //     overrideMimeType() {}
        //     send() {}
        //     addEventListener() {}
        //   },
        // });

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
        //this.messageTextarea.style.height = this.messageTextarea.scrollHeight + 'px';
        await this.sendRequest(this.messageTextarea.value);
        switch (this.questionType) {
            case 'Одиночный выбор':
                this.answers[parseInt(this.responseContent.replace(/\D/g, '')) - 1].input.click();
                break;
            case 'Множественный выбор':
                this.responseContent.split(/\D/g).filter(Boolean).map(num => (this.answers[parseInt(num) - 1].input.checked = true, num));
                break;
            case 'Сопоставление':
                break;
            case 'Сортировка':
                break;
            case 'Текcтовый ответ':
                $('#answers-').innerHTML = this.responseContent.replace(/\\boxed\{([^}]+)\}/, '$1');
        }


    },

    createStyle() {
        _({
            tag: 'style',
            append: document.head,
            html: `

.palette{
  width:  30%;
  height: 100vh;
  float:  right;
  background: #0000;
  box-sizing: border-box;
}
.cockpit {
  position: fixed;
  width: 30%;
  height: 100vh;
  right:0;
  top:0;
  background: #0002;
  border-left: 1px solid #000;
  box-sizing: border-box;
  padding: 0.5rem;
  .question-method {
    display:grid;
    grid-template-columns: 1fr 1fr;
    text-align: center;
    height: 2.5rem;
    line-height: 2.5rem;
    margin-bottom: 0.5rem;
    label {
      &:first-child{
        border-radius: 0.5rem 0 0 0.5rem;
      }
      &:last-child{
        border-radius: 0 0.5rem 0.5rem 0;
      }
      &:has(:checked){
        border: 1px solid #000;
        background: #fff;
        box-shadow: inset 0 0.1rem 0.1rem #000;
      }
      &:not(:has(:checked)){
        border: 0px;
        background: #0002;
      }
      input{
        display: none;
      }
      &:hover{
        border: 1px solid #000;
        background: #ffff;
      }
    }
    & ~ [data-question-method]{
      display:none;
    }
    &:has([value=text]:checked) ~ [data-question-method=text],
    &:has([value=image]:checked) ~ [data-question-method=image]{
      display: block;
    }
  }
  .message-for-send {
    width:   100%;
    height:  calc(50vh - 4rem);
    display: block;
  }
  .send-message{
    width: 100%;
    display: block;
    margin: 0.5rem 0rem 0.5rem 0rem;
  }
  .image-actions{
    grid-template-columns: 4rem 1fr;
    display: grid;
    gap: .5rem;
    padding: 0.5rem 0rem 0.5rem 0rem;
    button{
      background: transparent;
      border: 1px solid #888;
      &:hover{
        background: #fff;
        border: 1px solid red;
      }
    }
  }
  .communication-log{
    width: 100%;
    height:  calc(50vh - 4rem);
    resize: vertical;
    overflow-y: scroll;
    background: #fff;
    border: 1px solid #000;
    * {
      /*transform: scale(0.5);*/
    }
    .request, .response {
      color: #fff;
      font-size: 0.8rem;
      max-width: calc(100% - 2rem);
      background: var(--c);
      padding: 1em;
      /* triangle dimension */
      --b: 2em; /* base */
      --h: 1em; /* height */

      --p: 100%; /* triangle position (0%:top 100%:bottom) */
      --r: 1.2em; /* the radius */
    }
    .request {
      --c: #563444;
      border-radius: var(--r)/var(--r) min(var(--r),var(--p) - var(--b)/2) min(var(--r),100% - var(--p) - var(--b)/2) var(--r);
      clip-path: polygon(100% 100%,0 100%,0 0,100% 0, 100% max(0%  ,var(--p) - var(--b)/2), calc(100% + var(--h)) var(--p), 100% min(100%,var(--p) + var(--b)/2));
      border-image: conic-gradient(var(--c) 0 0) fill 0/ calc(var(--p) - var(--b)/2) 0 calc(100% - var(--p) - var(--b)/2) var(--r)/ 0 var(--h) 0 0;
    }

    .response {
      --c: #cf9d38;
      border-radius: var(--r)/min(var(--r),var(--p) - var(--b)/2) var(--r) var(--r) min(var(--r),100% - var(--p) - var(--b)/2);
      clip-path: polygon(0 100%,100% 100%,100% 0,0 0, 0 max(0%  ,var(--p) - var(--b)/2), calc(-1*var(--h)) var(--p), 0 min(100%,var(--p) + var(--b)/2));
      border-image: conic-gradient(var(--c) 0 0) fill 0/ calc(var(--p) - var(--b)/2) var(--r) calc(100% - var(--p) - var(--b)/2) 0/ 0 0 0 var(--h);
    }
  }

}

      `,
        });
    },

    createCockpit() {
        let page = $('#page');
        _({
            cls: 'palette',
            before: page,
        });
        this.cockpit = _({
            cls: 'cockpit',
            before: page,
            children: [
            {
                cls: 'question-method',
                children: [
                {
                    tag: 'label',
                    children: [
                    {
                        tag: 'input',
                        attr: {
                            type: 'radio',
                            name: 'question-method',
                            value: 'text',
                            checked: true
                        },
                    },
                    {
                        tag: 'span',
                        text: 'Текстовый вопрос',
                    }, ],
                },
                {
                    tag: 'label',
                    children: [
                    {
                        tag: 'input',
                        attr: {
                            type: 'radio',
                            name: 'question-method',
                            value: 'image'
                        },
                    },
                    {
                        tag: 'span',
                        text: 'Вопрос с картинкой',
                    }, ],
                }, ],
            },
            {
                cls: 'question-details',
                attr: {
                    'data-question-method': 'text'
                },
                children: [
                {
                    children: {
                        tag: 'textarea',
                        cls: 'message-for-send',
                    },
                },
                {
                    tag: 'button',
                    cls: 'send-message',
                    text: '📄 Отправить ассистенту текст',
                    on: {
                        click: e => {
                            cancel(e);
                            console.log('Text', this.messageTextarea.value);
                            this.sendRequest(this.messageTextarea.value);
                        },
                    },
                }, ],
            },
            {
                cls: 'question-details',
                attr: {
                    'data-question-method': 'image'
                },
                children: [
                {
                    children: {
                        tag: 'canvas',
                        css: {
                            display: 'block',
                            width: '100%',
                        },
                    },
                },
                {
                    cls: 'image-actions',
                    children: [
                    {
                        tag: 'button',
                        title: 'Переделать картинку',
                        text: '📸',
                    },
                    {
                        tag: 'button',
                        text: '🏞 Отправить ассистенту картинку',
                    }, ],
                }, ],
            },
            {
                cls: 'communication-log',
            }, ],
        });

        this.messageTextarea = $('.message-for-send', this.cockpit);
        let formRect = document.forms[0].getBoundingClientRect();

        this.formCanvas = $('canvas', this.cockpit);
        this.formCanvas.setAttribute('width', formRect.width);
        this.formCanvas.setAttribute('height', formRect.height);

        this.communicationLog = $('.communication-log', this.cockpit);

        // this.makeScreenshot(document.forms[0]);

        $('#footer').remove();
        $('#header', page).remove();
        $('#top-menu', page).remove();
        $('#breadcrumbs', page).remove();
        $('.curators-and-accounts', page).remove();
    },

    logResponse(response) {
        let item = _({
            tag: 'pre',
            cls: 'response',
            html: response,
            append: this.communicationLog
        });
        // this.communicationLog.scrollTo(this.communicationLog.scrollHeight);
    },

    logRequest(request) {
        let item = _({
            tag: 'pre',
            cls: 'request',
            html: request,
            append: this.communicationLog
        });
        // this.communicationLog.scrollTo(this.communicationLog.scrollHeight);
    },

    parseDiscipline() {
        this.discipline = document
            .querySelector('.player-discipline')
            .innerText.replace(/\(Пересдача\)$/, '')
            .trim();
    },
    parseQuestionType() {
        this.questionType = document.forms[0]
            .querySelector('div.clear ~ span ~ span')
            .innerText.split('•')
            .map(x => x.trim())[0];
    },
    parseQuestionNumbers() {
        this.questionCurrent = parseInt(
            document
            .querySelector('.player-questions')
            .innerText.trim()
            .replace(/^Вопрос /, '')
            .trim()
        );
        this.questionTotal = parseInt($('.test-sub-question').innerText.trim().replace(/^из /, '').trim());
    },
    findQuestionImages() {
        return $$('img', $('#player-assessments-form > span + span > p')) || [];
    },
    findVariantsImages() {
        return (
            $$('div.test-answers img', $('#player-assessments-form > div.clear ~ span ~ span ~ div:has(.test-answers)')) || []
        );
    },
    findSortingImages() {
        return (
            $$('#player-assessments-form .ui-sortable > div').map(div => $$('img', $('span.order-counter + div', div))) || []
        );
    },
    findComparisonImages() {
        return $$('#player-assessments-form ul li > div').map(div => $('img', $('div ', div))) || [];
    },
    parseQuestion() {
        let questionElements = $$('#player-assessments-form > span + span > p');
        let text = '';
        for (let questionElement of questionElements) {
            if ($$('*', questionElement).length) {
                console.warn('В вопросе есть элементы.');
            }
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
            if ($$('*', label).length) {
                console.warn('В ответе есть элементы');
            }
            let answer = label.innerText.trim();
            let value = input.getAttribute('value');
            return {
                marker,
                answer,
                value,
                input
            };
        });
        return answerVariants;
    },
    makeText() {
        let text = `
      Вопрос:
      ${this.question}

      Тип вопроса: ${this.questionType}.

      ${this.QUESTION_TYPES.get(this.questionType).description}
`;
        if (this.answers?.length) {
            if (this.questionType == 'Одиночный выбор' || this.questionType == 'Множественный выбор') {
                text += `
        Варианты ответов:
`;
            } else if (this.questionType == 'Сопоставление' || this.questionType == 'Сортировка') {
                text += `
        Данные:
`;
            }
            for (let i = 0; i < this.answers.length; i++) {
                let {
                    marker,
                    answer
                } = this.answers[i];
                text += `\t${marker}. ${answer}.
`;
            }
        }
        return text.replace(/(?<=\n)[ ]+(?=\S)/g, '');
    },
    createThread() {
        throw new Error('Method not implemented');
    },
    async sendRequest(content) {
        this.logRequest(content);
        try {
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
                    timeout: 12e4, // 120 секунд
                    data: JSON.stringify({
                        messages: [
                        {
                            role: 'system',
                            // content: 'Отвечайте на каждый поставленный вопрос без ошибок и максимально точно. Вопрос может относиться к одному из пяти типов: текстовый ответ, одиночный выбор, множественный выбор, сортировка или сопоставление.\n\n# Подробности\n\n- **Текстовый ответ**: Подберите наиболее подходящий термин, соответствующий описанию.\n- **Одиночный выбор**: Выберите наиболее подходящий вариант ответа из предложенных.\n- **Множественный выбор**: Оцените, насколько каждый из предложенных вариантов соответствует описанной ситуации, и выберите только правильные.\n- **Сортировка**: Расставьте предложенные элементы в правильном порядке, будь то процесс или хронологическое расположение.\n- **Сопоставление**: Свяжите термины с их соответствующими свойствами или действиями.\n\n# Output Format\n\nОтвет должен быть кратким и точным. Формат ответа зависит от типа вопроса:\n- Для текстового ответа: короткое предложение.\n- Для одиночного выбора: выбранный вариант.\n- Для множественного выбора: перечисление выбранных вариантов.\n- Для сортировки: последовательность выбранных элементов.\n- Для сопоставления: пары термин-свойство или действие.\n\n# Примеры\n\n### Текстовый ответ\n**Вопрос:** Какое животное обладает хоботом?\n**Ответ:** Слон\n\n### Одиночный выбор\n**Вопрос:** Какой цвет получается при смешении синего и красного?\n- 1. Зеленый\n- 2. Фиолетовый\n- 3. Оранжевый\n\n**Ответ:** 2.\n\n### Множественный выбор\n**Вопрос:** Какие из приведенных фруктов растут на деревьях? (Выберите все подходящие)\n- 1. Яблоко\n- 2. Виноград\n- 3. Клубника\n- 4. Персик\n\n**Ответ:** 1., 4.\n\n### Сортировка\n**Вопрос:** Расставьте события в правильном порядке:\n1. Пробуждение\n2. Завтрак\n3. Умывание\n4. Поход на работу\n\n**Ответ:** 1, 3, 2, 4.\n\n### Сопоставление\n**Вопрос:** Сопоставьте животных с их местами обитания:\nA. Слон \nB. Пингвин\nC. Кенгуру\n\nD. Ледник\nE. Саванна\nF. Австралия\n\n**Ответ:** A-E, B-D, C-F.',
                            content: [
                            {
                                text: 'Отвечайте на каждый поставленный вопрос без ошибок и максимально точно. Вопрос может относиться к одному из пяти типов: текстовый ответ, одиночный выбор, множественный выбор, сортировка или сопоставление.\n\n# Подробности\n\n- **Текстовый ответ**: Подберите наиболее подходящий термин, соответствующий описанию.\n- **Одиночный выбор**: Выберите наиболее подходящий вариант ответа из предложенных.\n- **Множественный выбор**: Оцените, насколько каждый из предложенных вариантов соответствует описанной ситуации, и выберите только правильные.\n- **Сортировка**: Расставьте предложенные элементы в правильном порядке, будь то процесс или хронологическое расположение.\n- **Сопоставление**: Свяжите термины с их соответствующими свойствами или действиями.\n\n# Output Format\n\nОтвет должен быть кратким и точным. Формат ответа зависит от типа вопроса:\n- Для текстового ответа: короткое предложение.\n- Для одиночного выбора: выбранный вариант.\n- Для множественного выбора: перечисление выбранных вариантов.\n- Для сортировки: последовательность выбранных элементов.\n- Для сопоставления: пары термин-свойство или действие.\n\n# Примеры\n\n### Текстовый ответ\n**Вопрос:** Какое животное обладает хоботом?\n**Ответ:** Слон\n\n### Одиночный выбор\n**Вопрос:** Какой цвет получается при смешении синего и красного?\n- 1. Зеленый\n- 2. Фиолетовый\n- 3. Оранжевый\n\n**Ответ:** 2.\n\n### Множественный выбор\n**Вопрос:** Какие из приведенных фруктов растут на деревьях? (Выберите все подходящие)\n- 1. Яблоко\n- 2. Виноград\n- 3. Клубника\n- 4. Персик\n\n**Ответ:** 1., 4.\n\n### Сортировка\n**Вопрос:** Расставьте события в правильном порядке:\n1. Пробуждение\n2. Завтрак\n3. Умывание\n4. Поход на работу\n\n**Ответ:** 1, 3, 2, 4.\n\n### Сопоставление\n**Вопрос:** Сопоставьте животных с их местами обитания:\nA. Слон \nB. Пингвин\nC. Кенгуру\n\nD. Ледник\nE. Саванна\nF. Австралия\n\n**Ответ:** A-E, B-D, C-F.',
                                type: 'text',
                            }, ],
                        },
                        {
                            role: 'user',
                            //content: content,
                            content: [
                            {
                                type: 'text',
                                text: content,
                            }, ],
                        }, ],
                        // temperature: 0,
                        // max_completion_tokens: 2048,
                        // top_p: 1,
                        // frequency_penalty: 0,
                        // presence_penalty: 0,

                        // model: 'openai/o3-mini',
                        // model: 'openai/gpt-4o-2024-11-20',
                        //model: 'openai/gpt-oss-120b:free',
                        // model: 'anthropic/claude-sonnet-4',
			// model: 'google/gemini-2.5-pro',
			// model: 'qwen/qwen3-30b-a3b',
			// model: 'google/gemini-2.5-flash',
			// model: 'x-ai/grok-code-fast-1',
			model: 'deepseek/deepseek-r1-zero:free',
                        // model: 'deepseek/deepseek-r1-distill-qwen-14b',


                        // response_format: {
                        // type: 'text',
                        // },
                        // stream: false,
                    }),
                    onload: response => res(response),
                    onloadend: response => res(response),
                    onerror: response => rej(response),
                    ontimeout: response => rej(response),
                    onabort: response => rej(response),
                });
                console.log(request);
            });
            response = await response;
            //console.log(response.response.choices[0].message.content);
            console.log(response);
            console.log(response.response);
            console.log(response.response.choices);
            this.logResponse(response.response.choices[0].message.content.replace(/\\boxed\{([^}]+)\}/, '$1'));
            this.responseContent = response.response.choices[0].message.content;
            return this.responseContent;
        }
        catch (error) {
            console.error(error)
            console.error(error.message)
            console.error(error.stack)
        }

    },
    onParseError(error) {
        console.error(error.message);
        console.error(error.stack);
    },
    makeAddition() {
        throw new ReferenceError('Method not implemented');
    },
    async makeScreenshot(element) {
        // Request screen capture
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            displaySurface: 'browser'
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        video.onloadedmetadata = async () => {
            // Set canvas dimensions
            const rect = element.getBoundingClientRect();
            const canvas = this.formCanvas;
            const context = canvas.getContext('2d');

            canvas.width = rect.width;
            canvas.height = rect.height;

            // Draw the video frame to the canvas
            context.drawImage(video, rect.left, rect.top, rect.width, rect.height, 0, 0, rect.width, rect.height);

            // Stop the video stream
            stream.getTracks().forEach(track => track.stop());

            // Create a link to download the image
            // const imgData = canvas.toDataURL('image/png');
            // const link = document.createElement('a');
            // link.href = imgData;
            // link.download = 'screenshot.png';
            // link.click();
        };
    },
};

AssistantHelper.init();