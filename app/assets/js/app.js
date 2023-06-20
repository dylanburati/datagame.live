import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

import "phoenix_html";
import { Socket } from "phoenix";
import { LiveSocket } from "phoenix_live_view";

import { SheetPage } from "./sheet";
import { SheetAdvancedPage } from "./sheetAdvanced";

let csrfToken = document
  .querySelector("meta[name='csrf-token']")
  .getAttribute("content");
let liveSocket = new LiveSocket("/live", Socket, {
  params: { _csrf_token: csrfToken },
});
liveSocket.connect();
window.liveSocket = liveSocket;

const url = new URL(window.location);
if (url.pathname === window.pageRoutes.sheet) {
  window.vm = new SheetPage();
} else if (url.pathname === window.pageRoutes.sheetAdvanced) {
  window.vm = new SheetAdvancedPage();
}
