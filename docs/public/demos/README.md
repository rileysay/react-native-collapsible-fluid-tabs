# Demo recordings

Put your own recordings here, then set their paths in lib/demos.ts.

- Prefer H.264 MP4 for broad video support, or WebM. MOV codec support varies by browser.
- GIF, PNG, JPEG, and WebP are supported via the image field.
- Record the screen only: the site supplies the device frame.
- The iPhone 18 Pro frame's inner screen is 402 × 874 CSS pixels (1206 × 2622 at 3×). Recordings with this aspect ratio fit edge to edge.
- The default fit is contain, preserving the full recording. Use cover only if cropping is intentional.
- Include a poster image for video when possible.
- Keep recordings short and compress before publishing. Video is muted, inline, and controlled by the visitor.
- Preview locally at /studio. Choosing a file there does not save it into this folder.

An example first entry:

    video: '/demos/profile.mp4',
    poster: '/demos/profile-poster.png',
    fit: 'contain',

For an animated GIF:

    image: '/demos/profile.gif',
