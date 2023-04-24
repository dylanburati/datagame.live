import "phoenix_html"

import { SheetPage } from "./sheet";
import { SheetAdvancedPage } from "./sheetAdvanced"
const url = new URL(window.location);
if (url.pathname === window.pageRoutes.sheet) {
  window.vm = new SheetPage();
} else if (url.pathname === window.pageRoutes.sheetAdvanced) {
  window.vm = new SheetAdvancedPage();
}
