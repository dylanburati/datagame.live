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

const matcher = (pattern) => (input) => {
  const path1 = pattern.split('/');
  const path2 = input.split('/');
  return (
    path1.length === path2.length &&
    path2.every((part, i) =>
      path1[i] === '__PARAM__' || path1[i] === part
    )
  );
}
const matchers = Object.fromEntries(
  Object.entries(window.pageRoutes).map(([k, v]) => [k, matcher(v)])
);
const pathname = window.location.pathname.slice();
if (matchers.sheet(pathname) || matchers.sheetLive(pathname)) {
  window.vm = new SheetPage();
} else if (matchers.sheetAdvanced(pathname)) {
  window.vm = new SheetAdvancedPage();
}
