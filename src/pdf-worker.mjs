// PDF.js worker entry: install the Map polyfill before the bundled worker runs.
import './map-polyfill.mjs';
import './vendor/pdfjs/pdf.worker.mjs';
