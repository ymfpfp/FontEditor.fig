import fontEngine from "font-engine";
import {Mutable} from "./types";
import Glyph from "font-engine/dist/glyph";

figma.showUI(
  __html__,
);

type MessageType<T> = {type: T};
type UploadMessage = MessageType<"upload"> & {buf: Uint8Array};

type Message = UploadMessage;

figma.ui.onmessage = async (msg: Message) => {
  switch (msg.type) {
    case "upload":
      await upload(msg);
      break;
  }

  figma.closePlugin();
};

const upload = async (msg: UploadMessage) => {
  const font = fontEngine.font(msg.buf);
  const test = font.glyph("a".charCodeAt(0));
  const ranges = [["A".charCodeAt(0), "z".charCodeAt(0)], [0x3040, 0x3060]];

  const render = async (glyph: Glyph) => {
    const outline = figma.createVector();
    const network: Mutable<VectorNetwork> = {
      vertices: [],
      segments: [],
      regions: []
    };

    for (const contour of glyph.outline) {
      for (const curve of contour) {
        let [p0, p1, tangentStart, tangentEnd] = curve.curve.map(point => {
          return {
            x: point[0],
            y: -point[1]
          };
        });
        tangentStart.x -= p0.x;
        tangentStart.y -= p0.y;
        tangentEnd.x -= p1.x;
        tangentEnd.y -= p1.y;
        network.vertices.push(p0, p1);
        const l = network.vertices.length - 1;
        if (network.segments.length) {
          const prev = network.segments[network.segments.length - 1];
          network.segments.push(
            {
              start: prev.end,
              end: l - 1,
              tangentStart: prev.tangentEnd,
              tangentEnd: tangentStart
            }
          )
        }
        network.segments.push(
          {
            start: l - 1,
            end: l,
            tangentStart,
            tangentEnd
          }
        );
      }
    }

    await outline.setVectorNetworkAsync(network);

    outline.strokes = [{
      type: "SOLID",
      color: {r: 0, g: 0, b: 0},
    }];
    outline.strokeWeight = 1;
    figma.currentPage.appendChild(outline);
    return outline;
  };

  const maxX = 10000;
  let x = 0;
  let y = 0;
  let rowY = 0;
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i++) {
      const glyph = font.glyph(i);
      const outline = await render(glyph);
      outline.x = x;
      outline.y = y;
      x += glyph.metadata.bearings.lsb + glyph.metadata.bearings.rsb;
      rowY = Math.max(
        rowY,
        glyph.metadata.bearings.tsb + glyph.metadata.bearings.bsb
      );
      if (x > maxX) {
        x = 0;
        y += rowY;
      }
    }
  }
};
