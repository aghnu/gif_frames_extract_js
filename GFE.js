/*
Copyright (c) 2022 Shachaf Ben-Kiki, Gengyuan Huang

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
GFE is a simplification of the forked project libgif-js 'https://github.com/buzzfeed/libgif-js'.
*/


(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else {
        root.GFE = factory();
    }
}(this, function () {

    // Functions
    function bitsToNum(ba) {
        return ba.reduce(function (s, n) {
            return s * 2 + n;
        }, 0);
    };

    function byteToBitArr(bite) {
        let a = [];
        for (let i = 7; i >= 0; i--) {
            a.push(!!(bite & (1 << i)));
        }
        return a;
    };

    function lzwDecode(minCodeSize, data) {
        // TODO: Now that the GIF parser is a bit different, maybe this should get an array of bytes instead of a String?
        let pos = 0; // Maybe this streaming thing should be merged with the Stream?
        let readCode = function (size) {
            let code = 0;
            for (let i = 0; i < size; i++) {
                if (data.charCodeAt(pos >> 3) & (1 << (pos & 7))) {
                    code |= 1 << i;
                }
                pos++;
            }
            return code;
        };

        let output = [];

        let clearCode = 1 << minCodeSize;
        let eoiCode = clearCode + 1;

        let codeSize = minCodeSize + 1;

        let dict = [];

        let clear = function () {
            dict = [];
            codeSize = minCodeSize + 1;
            for (let i = 0; i < clearCode; i++) {
                dict[i] = [i];
            }
            dict[clearCode] = [];
            dict[eoiCode] = null;

        };

        let code;
        let last;

        while (true) {
            last = code;
            code = readCode(codeSize);

            if (code === clearCode) {
                clear();
                continue;
            }
            if (code === eoiCode) break;

            if (code < dict.length) {
                if (last !== clearCode) {
                    dict.push(dict[last].concat(dict[code][0]));
                }
            } else {
                if (code !== dict.length) throw new Error('Invalid LZW code.');
                dict.push(dict[last].concat(dict[last][0]));
            }
            output.push.apply(output, dict[code]);

            if (dict.length === (1 << codeSize) && codeSize < 12) {
                // If we're at the last code and codeSize is 12, the next code will be a clearCode, and it'll be 12 bits long.
                codeSize++;
            }
        }

        // I don't know if this is technically an error, but some GIFs do it.
        //if (Math.ceil(pos / 8) !== data.length) throw new Error('Extraneous LZW bytes.');
        return output;
    };

    function parseGIF(st, handler) {
        handler || (handler = {});

        // LZW (GIF-specific)
        let parseCT = function (entries) { // Each entry is 3 bytes, for RGB.
            let ct = [];
            for (let i = 0; i < entries; i++) {
                ct.push(st.readBytes(3));
            }
            return ct;
        };

        let readSubBlocks = function () {
            let size, data;
            data = '';
            do {
                size = st.readByte();
                data += st.read(size);
            } while (size !== 0);
            return data;
        };

        let parseHeader = function () {
            let hdr = {};
            hdr.sig = st.read(3);
            hdr.ver = st.read(3);
            if (hdr.sig !== 'GIF') throw new Error('Not a GIF file.'); // XXX: This should probably be handled more nicely.
            hdr.width = st.readUnsigned();
            hdr.height = st.readUnsigned();

            let bits = byteToBitArr(st.readByte());
            hdr.gctFlag = bits.shift();
            hdr.colorRes = bitsToNum(bits.splice(0, 3));
            hdr.sorted = bits.shift();
            hdr.gctSize = bitsToNum(bits.splice(0, 3));

            hdr.bgColor = st.readByte();
            hdr.pixelAspectRatio = st.readByte(); // if not 0, aspectRatio = (pixelAspectRatio + 15) / 64
            if (hdr.gctFlag) {
                hdr.gct = parseCT(1 << (hdr.gctSize + 1));
            }
            handler.hdr && handler.hdr(hdr);
        };

        let parseExt = function (block) {
            let parseGCExt = function (block) {
                let blockSize = st.readByte(); // Always 4
                let bits = byteToBitArr(st.readByte());
                block.reserved = bits.splice(0, 3); // Reserved; should be 000.
                block.disposalMethod = bitsToNum(bits.splice(0, 3));
                block.userInput = bits.shift();
                block.transparencyGiven = bits.shift();

                block.delayTime = st.readUnsigned();

                block.transparencyIndex = st.readByte();

                block.terminator = st.readByte();

                handler.gce && handler.gce(block);
            };

            let parseComExt = function (block) {
                block.comment = readSubBlocks();
                handler.com && handler.com(block);
            };

            let parsePTExt = function (block) {
                // No one *ever* uses this. If you use it, deal with parsing it yourself.
                let blockSize = st.readByte(); // Always 12
                block.ptHeader = st.readBytes(12);
                block.ptData = readSubBlocks();
                handler.pte && handler.pte(block);
            };

            let parseAppExt = function (block) {
                let parseNetscapeExt = function (block) {
                    let blockSize = st.readByte(); // Always 3
                    block.unknown = st.readByte(); // ??? Always 1? What is this?
                    block.iterations = st.readUnsigned();
                    block.terminator = st.readByte();
                    handler.app && handler.app.NETSCAPE && handler.app.NETSCAPE(block);
                };

                let parseUnknownAppExt = function (block) {
                    block.appData = readSubBlocks();
                    // FIXME: This won't work if a handler wants to match on any identifier.
                    handler.app && handler.app[block.identifier] && handler.app[block.identifier](block);
                };

                let blockSize = st.readByte(); // Always 11
                block.identifier = st.read(8);
                block.authCode = st.read(3);
                switch (block.identifier) {
                    case 'NETSCAPE':
                        parseNetscapeExt(block);
                        break;
                    default:
                        parseUnknownAppExt(block);
                        break;
                }
            };

            let parseUnknownExt = function (block) {
                block.data = readSubBlocks();
                handler.unknown && handler.unknown(block);
            };

            block.label = st.readByte();
            switch (block.label) {
                case 0xF9:
                    block.extType = 'gce';
                    parseGCExt(block);
                    break;
                case 0xFE:
                    block.extType = 'com';
                    parseComExt(block);
                    break;
                case 0x01:
                    block.extType = 'pte';
                    parsePTExt(block);
                    break;
                case 0xFF:
                    block.extType = 'app';
                    parseAppExt(block);
                    break;
                default:
                    block.extType = 'unknown';
                    parseUnknownExt(block);
                    break;
            }
        };

        let parseImg = function (img) {
            let deinterlace = function (pixels, width) {
                // Of course this defeats the purpose of interlacing. And it's *probably*
                // the least efficient way it's ever been implemented. But nevertheless...
                let newPixels = new Array(pixels.length);
                let rows = pixels.length / width;
                let cpRow = function (toRow, fromRow) {
                    let fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
                    newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
                };

                // See appendix E.
                let offsets = [0, 4, 2, 1];
                let steps = [8, 8, 4, 2];

                let fromRow = 0;
                for (let pass = 0; pass < 4; pass++) {
                    for (let toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
                        cpRow(toRow, fromRow)
                        fromRow++;
                    }
                }

                return newPixels;
            };

            img.leftPos = st.readUnsigned();
            img.topPos = st.readUnsigned();
            img.width = st.readUnsigned();
            img.height = st.readUnsigned();

            let bits = byteToBitArr(st.readByte());
            img.lctFlag = bits.shift();
            img.interlaced = bits.shift();
            img.sorted = bits.shift();
            img.reserved = bits.splice(0, 2);
            img.lctSize = bitsToNum(bits.splice(0, 3));

            if (img.lctFlag) {
                img.lct = parseCT(1 << (img.lctSize + 1));
            }

            img.lzwMinCodeSize = st.readByte();

            let lzwData = readSubBlocks();

            img.pixels = lzwDecode(img.lzwMinCodeSize, lzwData);

            if (img.interlaced) { // Move
                img.pixels = deinterlace(img.pixels, img.width);
            }

            handler.img && handler.img(img);
        };

        let parseBlock = function () {
            let block = {};
            block.sentinel = st.readByte();

            switch (String.fromCharCode(block.sentinel)) { // For ease of matching
                case '!':
                    block.type = 'ext';
                    parseExt(block);
                    break;
                case ',':
                    block.type = 'img';
                    parseImg(block);
                    break;
                case ';':
                    block.type = 'eof';
                    handler.eof && handler.eof(block);
                    break;
                default:
                    throw new Error('Unknown block: 0x' + block.sentinel.toString(16)); // TODO: Pad this with a 0.
            }

            if (block.type !== 'eof') setTimeout(parseBlock, 0);
        };

        let parse = function () {
            parseHeader();
            setTimeout(parseBlock, 0);
        };

        parse();
    };

    // Stream
    function Stream(data) {
        this.data = data;
        this.len = this.data.length;
        this.pos = 0;

        this.readByte = function () {
            if (this.pos >= this.data.length) {
                throw new Error('Attempted to read past end of stream.');
            }
            if (data instanceof Uint8Array)
                return data[this.pos++];
            else
                return data.charCodeAt(this.pos++) & 0xFF;
        };

        this.readBytes = function (n) {
            let bytes = [];
            for (let i = 0; i < n; i++) {
                bytes.push(this.readByte());
            }
            return bytes;
        };

        this.read = function (n) {
            let s = '';
            for (let i = 0; i < n; i++) {
                s += String.fromCharCode(this.readByte());
            }
            return s;
        };

        this.readUnsigned = function () { // Little-endian.
            let a = this.readBytes(2);
            return (a[1] << 8) + a[0];
        };
    };

    const GFE = function (srcURL, callback = () => {}) {

        const frames = [];
        const tmpCanvas = document.createElement('canvas');

        let frame = null;
        let delay = null;
        let stream = null;

        let disposalMethod = null;
        let disposalRestoreFromIdx = null;
        let lastDisposalMethod = null;

        let lastImg = null;
        let hdr = {};
        let transparency = null;

        // functions
        function clear() {
            frame = null;
            delay = null;
            lastDisposalMethod = disposalMethod;
            disposalMethod = null;
            transparency = null;
        }

        function pushFrame() {
            if (!frame) return;
            frames.push({
                data: frame.getImageData(0, 0, hdr.width, hdr.height),
                delay: delay
            });
        };

        function setSizes(w, h) {
            tmpCanvas.width = w;
            tmpCanvas.height = h;
            tmpCanvas.getContext('2d').setTransform(1, 0, 0, 1, 0, 0);
        }

        function doHdr(_hdr) {
            hdr = _hdr;
            setSizes(hdr.width, hdr.height)
        };

        function doGCE(gce) {
            pushFrame();
            clear();
            transparency = gce.transparencyGiven ? gce.transparencyIndex : null;
            delay = gce.delayTime;
            disposalMethod = gce.disposalMethod;
        };

        function doImg(img) {
            if (!frame) frame = tmpCanvas.getContext('2d');

            let currIdx = frames.length;

            //ct = color table, gct = global color table
            let ct = img.lctFlag ? img.lct : hdr.gct; // TODO: What if neither exists?

            /*
            Disposal method indicates the way in which the graphic is to
            be treated after being displayed.

            Values :    0 - No disposal specified. The decoder is
                            not required to take any action.
                        1 - Do not dispose. The graphic is to be left
                            in place.
                        2 - Restore to background color. The area used by the
                            graphic must be restored to the background color.
                        3 - Restore to previous. The decoder is required to
                            restore the area overwritten by the graphic with
                            what was there prior to rendering the graphic.

                            Importantly, "previous" means the frame state
                            after the last disposal of method 0, 1, or 2.
            */
            if (currIdx > 0) {
                if (lastDisposalMethod === 3) {
                    // Restore to previous
                    // If we disposed every frame including first frame up to this point, then we have
                    // no composited frame to restore to. In this case, restore to background instead.
                    if (disposalRestoreFromIdx !== null) {
                        frame.putImageData(frames[disposalRestoreFromIdx].data, 0, 0);
                    } else {
                        frame.clearRect(lastImg.leftPos, lastImg.topPos, lastImg.width, lastImg.height);
                    }
                } else {
                    disposalRestoreFromIdx = currIdx - 1;
                }

                if (lastDisposalMethod === 2) {
                    // Restore to background color
                    // Browser implementations historically restore to transparent; we do the same.
                    // http://www.wizards-toolkit.org/discourse-server/viewtopic.php?f=1&t=21172#p86079
                    frame.clearRect(lastImg.leftPos, lastImg.topPos, lastImg.width, lastImg.height);
                }
            }
            // else, Undefined/Do not dispose.
            // frame contains final pixel data from the last frame; do nothing

            //Get existing pixels for img region after applying disposal method
            let imgData = frame.getImageData(img.leftPos, img.topPos, img.width, img.height);

            //apply color table colors
            img.pixels.forEach(function (pixel, i) {
                // imgData.data === [R,G,B,A,R,G,B,A,...]
                if (pixel !== transparency) {
                    imgData.data[i * 4 + 0] = ct[pixel][0];
                    imgData.data[i * 4 + 1] = ct[pixel][1];
                    imgData.data[i * 4 + 2] = ct[pixel][2];
                    imgData.data[i * 4 + 3] = 255; // Opaque.
                }
            });

            frame.putImageData(imgData, img.leftPos, img.topPos);

            lastImg = img;
        };

        function errorHandler(e) {
            clear();
            console.log(e);
        }

        function sendResult() {
            callback(frames);
        }

        function doParse() {
            const handler = {
                hdr: doHdr,
                gce: doGCE,
                com: () => {},
                app: {
                    NETSCAPE: () => {},
                },
                img: doImg,
                eof: () => {
                    pushFrame();
                    sendResult();
                }
            };

            try {
                parseGIF(stream, handler);
            } catch {
                errorHandler('parsing error');
            }
        };

        function extract(src) {
            var h = new XMLHttpRequest();
            // new browsers (XMLHttpRequest2-compliant)
            h.open('GET', src, true);

            if ('overrideMimeType' in h) {
                h.overrideMimeType('text/plain; charset=x-user-defined');
            }

            // old browsers (XMLHttpRequest-compliant)
            else if ('responseType' in h) {
                h.responseType = 'arraybuffer';
            }

            // IE9 (Microsoft.XMLHTTP-compliant)
            else {
                h.setRequestHeader('Accept-Charset', 'x-user-defined');
            }

            h.onload = function (e) {
                if (this.status != 200) {
                    errorHandler('response error');
                }
                // emulating response field for IE9
                if (!('response' in this)) {
                    this.response = new VBArray(this.responseText).toArray().map(String.fromCharCode).join('');
                }
                var data = this.response;
                if (data.toString().indexOf("ArrayBuffer") > 0) {
                    data = new Uint8Array(data);
                }

                stream = new Stream(data);
                setTimeout(doParse, 0);
            };
            h.onerror = function () {
                errorHandler('request error');
            };
            h.send();

        };

        extract(srcURL);
    };

    return GFE;
}));