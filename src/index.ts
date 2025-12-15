import fontEngine from "font-engine";

figma.showUI(
  __html__,
);

type MessageType<T> = {type: T};
type UploadMessage = MessageType<"upload"> & {buf: Uint8Array};

type Message = UploadMessage;

figma.ui.onmessage = (msg: Message) => {
  switch (msg.type) {
    case "upload":
      upload(msg);
      break;
  }

  figma.closePlugin();
};

const upload = (msg: UploadMessage) => {
  const font = fontEngine.font(msg.buf);
  console.log(font.glyph("á".charCodeAt(0)));
};
