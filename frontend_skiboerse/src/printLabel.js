import { apiFetch } from './api';

const COPIES = 2;

const LABEL_STYLES = `
  /* Dymo LabelWriter 400, Mehrzweck-Etiketten (30334 / S0722540), 54 x 25 mm */
  @page { size: 54mm 25mm; margin: 0; }
  * { margin: 0; padding: 0; }
  html, body { width: 54mm; }
  /* Break BEFORE each extra copy rather than after every copy: a trailing
     break, or a box exactly as tall as the page, makes the print engine emit
     an empty label between copies. */
  .label-page + .label-page { page-break-before: always; break-before: page; }
  .label-page { overflow: hidden; }
  /* Stay under the nominal page height. Safari reserves strips for
     headers/footers and some drivers report an imageable area smaller than the
     media, and an image taller than whatever is actually available spills onto
     an extra, empty label. */
  img { width: 100%; max-height: 23mm; height: auto; object-fit: contain; display: block; }
`;

/**
 * Render an item's label on the server and send it to the printer.
 * Throws with a message suitable for showing to the user.
 */
export async function printItemLabel(itemId) {
  const response = await apiFetch(`/api/items/${itemId}/print_label/`, {
    method: 'POST'
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Label konnte nicht erzeugt werden');
  }

  const printWindow = window.open('', '_blank', 'width=600,height=400');
  if (!printWindow) {
    throw new Error('Popup-Blocker aktiv. Bitte Popups für diese Seite erlauben.');
  }

  const pages = Array.from(
    { length: COPIES },
    (_, i) =>
      `<div class="label-page"><img src="data:image/png;base64,${data.image}" alt="Label ${i + 1}" /></div>`
  ).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Label ${data.barcode}</title>
      <style>${LABEL_STYLES}</style>
    </head>
    <body>
      ${pages}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 300);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
