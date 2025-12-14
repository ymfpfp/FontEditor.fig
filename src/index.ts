import t from "font-engine";

figma.showUI(
  __html__,
);

type MessageType<T> = {type: T};
type UploadMessage = MessageType<"upload"> & {buf: Uint8Array};

type Message = UploadMessage;

figma.ui.onmessage = (msg: Message) => {
  switch (msg.type) {
    case "upload":
      console.log("buf", msg.buf);
      console.log(t);
  }

  figma.closePlugin();
};
