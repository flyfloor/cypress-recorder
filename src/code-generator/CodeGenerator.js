import domEvents from './dom-events-to-record'
import pptrActions from './pptr-actions'
import Block from './Block'

const wrapDescribeHeader = `describe('test_name', function() {\n`

const wrapDescribeFooter = `})`;

const wrapItHeader = `  it('what_it_does', function() {\n`

const wrapItFooter = `  })\n`

const wrapBeforeEachHeader = `  beforeEach(() => {\n`;
const wrapBeforeEachFooter = `  })`;

export const defaults = {
  wrapDescribe: true,
  blankLinesBetweenBlocks: true,
  dataAttribute: ''
}

export default class CodeGenerator {
  constructor (options) {
    this._options = Object.assign(defaults, options);
    this._blocks = [];
    this._frame = 'cy';
    this._frameId = 0;
    this._allFrames = {};
    this._hasNavigation = false;
    this._beforeEachBlock = [];
  }

  generate (events) {
    return this._getHeader() + this._parseEvents(events) + this._getFooter();
  }

  _getHeader () {

    let newLine = '';

    if (this._options.blankLinesBetweenBlocks) {
    	newLine = `\n`;
    }

    let describeHeader = this._options.wrapDescribe ? wrapDescribeHeader + newLine : '';
    return describeHeader;
  }

  _getBeforeEach() {
    const _indent = this._options.wrapDescribe ? '    ' : '   ';
    if (this._beforeEachBlock.length > 0) {
      let _newLine = '\n';
      let _content = '';
      for (let block of this._beforeEachBlock) {
        const lines = block.getLines();
        for (let line of lines) {
          _content += _indent + line.value + _newLine;
        }
      }
      return wrapBeforeEachHeader + _content + wrapBeforeEachFooter + '\n\n';
    }
    return '';
  }

  _getFooter () {

    let newLine = '';

    if (this._options.blankLinesBetweenBlocks) {
    	newLine = `\n`;
	}

    //return this._options.wrapAsync ? wrappedFooter : footer
    let describeFooter = this._options.wrapDescribe ? wrapDescribeFooter + newLine : '';
	return wrapItFooter + newLine + describeFooter;
  }

  _parseEvents (events = []) {
    console.debug(`generating code for ${events ? events.length : 0} events`);
    let result = '';

    for (let i = 0; i < events.length; i++) {
      const { action, selector, value, href, keyCode, tagName, targetType, frameId, frameUrl, cookies } = events[i];
      // we need to keep a handle on what frames events originate from
      this._setFrames(frameId, frameUrl);

      switch (action) {
        case 'keydown':
          if (keyCode === 9) {
            //this._blocks.push(this._handleKeyDown(selector, value, keyCode))
          }
          break
        case 'click':
          this._blocks.push(this._handleClick(selector, events));
          break;
        case 'change':
          if (tagName === 'SELECT') {
            this._blocks.push(this._handleChange(tagName, selector, value));
          }
          if (tagName === 'INPUT') {
        		if(targetType){
            	this._blocks.push(this._handleChange(tagName, selector, value, targetType));
        		} else {
            	this._blocks.push(this._handleChange(tagName, selector, value));
        		}
          }
          break
        case 'goto*':
          this._blocks.push(this._handleGoto(href, frameId));
          break
        case 'viewport*':
          this._blocks.push((this._handleViewport(value.width, value.height)));
          break
        case 'navigation*':
          this._blocks.push(this._handleWaitForNavigation());
          this._blocks.push(this._handleGoto(href, frameId));
          this._hasNavigation = true;
          break;
        case 'cookie':
          this._beforeEachBlock.push(this._cleanCookie());
          cookies.map(item => this._beforeEachBlock.push(this._handleCookie(item)));
          break;
        case 'storage':
          value.map(item => this._blocks.push(this._handleLocalStorage(item)))
          break;
      }
    }

    const indent = this._options.wrapDescribe ? '    ' : '   ';
    let newLine = `\n`;

    if (this._options.blankLinesBetweenBlocks && this._blocks.length > 0) {
    	newLine = `\n \n`;
	  }

    for (let block of this._blocks) {
      const lines = block.getLines();
      for (let line of lines) {
        result += indent + line.value + newLine;
      }
    }

    result = this._getBeforeEach() + wrapItHeader + '\n' + result;

    return result;
  }

  _setFrames (frameId, frameUrl) {
    if (frameId && frameId !== 0) {
      this._frameId = frameId;
      this._frame = `frame_${frameId}`;
      this._allFrames[frameId] = frameUrl;
    } else {
      this._frameId = 0;
      this._frame = 'cy';
    }
  }

  _postProcess () {
    // when events are recorded from different frames, we want to add a frame setter near the code that uses that frame
    if (Object.keys(this._allFrames).length > 0) {
      this._postProcessSetFrames();
    }

    if (this._options.blankLinesBetweenBlocks && this._blocks.length > 0) {
      this._postProcessAddBlankLines();
    }
  }

  _handleKeyDown (selector, value) {
    const block = new Block(this._frameId);
    block.addLine({ type: domEvents.KEYDOWN, value: `${this._frame}.get('${selector}').type('${value}')`});
    return block;
  }

  _handleClick (selector) {
    const block = new Block(this._frameId);
    block.addLine({ type: domEvents.CLICK, value: `${this._frame}.get('${selector}').click()` });
    return block;
  }

  _handleChange (tagName, selector, value, targetType) {

    if (tagName === 'INPUT') {
		if (targetType === 'checkbox') {
			return new Block(this._frameId, { type: domEvents.CHANGE, value: `${this._frame}.get('${selector}').check('${value}')`});
		}
    	return new Block(this._frameId, { type: domEvents.CHANGE, value: `${this._frame}.get('${selector}').type('${value}')`});
	}

    return new Block(this._frameId, { type: domEvents.CHANGE, value: `${this._frame}.get('${selector}').select('${value}')`});
  }

  _handleGoto (href) {
    return new Block(this._frameId, { type: pptrActions.GOTO, value: `${this._frame}.visit('${href}')` });
  }

  _handleLocalStorage (pair) {
    const { name, value } = pair
    return new Block(this._frameId, { type: pptrActions.LOCAL_STORAGE, value: `window.localStorage.setItem('${name}', '${value}')` });
  }

  _handleCookie (cookiePair) {
    const { name, value, ...options } = cookiePair
    return new Block(this._frameId, { type: pptrActions.COOKIE, value: `${this._frame}.setCookie('${name}', '${value}', ${JSON.stringify(options)})` });
  }

  _cleanCookie () {
    return new Block(this._frameId, { type: pptrActions.COOKIE, value: `${this._frame}.clearCookies()` });
  }

  _handleViewport (width, height) {
    return new Block(this._frameId, { type: pptrActions.VIEWPORT, value: `${this._frame}.viewport(${width}, ${height})` });
  }

  _handleWaitForNavigation () {
    const block = new Block(this._frameId);
    return block;
  }

  _postProcessSetFrames () {
    for (let [i, block] of this._blocks.entries()) {
      const lines = block.getLines();
      for (let line of lines) {
        if (line.frameId && Object.keys(this._allFrames).includes(line.frameId.toString())) {
          const declaration = `const frame_${line.frameId} = frames.find(f => f.url() === '${this._allFrames[line.frameId]}')`;
          this._blocks[i].addLineToTop(({ type: pptrActions.FRAME_SET, value: declaration }));
          this._blocks[i].addLineToTop({ type: pptrActions.FRAME_SET, value: 'let frames = await page.frames()' });
          delete this._allFrames[line.frameId];
          break;
        }
      }
    }
  }

  _postProcessAddBlankLines () {
    let i = 0;
    while (i <= this._blocks.length) {
      const blankLine = new Block();
      blankLine.addLine({ type: null, value: '' });
      this._blocks.splice(i, 0, blankLine);
      i += 2;
    }
  }
}
