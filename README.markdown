# GFE
GFE is a simplification of the project [libgif-js](https://github.com/buzzfeed/libgif-js). It provides a function to extract the frames of a gif.

# Usage
```html
<script src='./GFE.js'></script>
<script>
  // GFE(gif_src_url, post_all_frames_callback, post_one_frame_callback);
  // example:
  GFE(gif_src_url, (frames) => {
    // function is called after all frames are extracted
    // an array of frames is passed to function
    /*
      frames[i]:
      {
        data:  ImageData,
        delay: int
      }
    */
  }, (frame) => {
    // function is called after each frame extraction
    // the frame is passed to function
  });
</script>
```

# License
Copyright (c) 2022 Shachaf Ben-Kiki, Gengyuan Huang

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
