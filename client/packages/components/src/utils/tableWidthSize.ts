/**
 *
 * @param columnId
 * @param max set a maximum width to return
 * @returns minimum width to display all column cells
 * @throws Error if element with class ${columnId} not found
 */
export const getTableWidthSize = (columnId: string, max: number): number => {
  const header = document.querySelector(`.th-${columnId}`);
  if (!header) {
    throw new Error(`Element with class th-${columnId} not found`);
  }

  const tableCells = document.querySelectorAll(`span.td-${columnId}`);

  // Create container for clones
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.visibility = 'hidden';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = 'auto';
  container.style.whiteSpace = 'nowrap';

  document.body.appendChild(container);

  try {
    // Clone and measure header
    const headerClone = header.cloneNode(true) as HTMLElement;
    headerClone.style.display = 'inline-block';
    headerClone.style.overflow = 'visible';
    headerClone.style.width = 'auto';
    headerClone.style.maxWidth = 'none';
    headerClone.style.whiteSpace = 'nowrap';
    container.appendChild(headerClone);
    const headerWidth = headerClone.scrollWidth;

    // Clone and measure each cell
    const cellWidths = Array.from(tableCells).map((cell) => {
      const cellClone = cell.cloneNode(true) as HTMLElement;
      cellClone.style.display = 'inline-block';
      cellClone.style.overflow = 'visible';
      cellClone.style.width = 'auto';
      cellClone.style.maxWidth = 'none';
      cellClone.style.whiteSpace = 'nowrap';
      container.appendChild(cellClone);
      const width = cellClone.scrollWidth;
      container.removeChild(cellClone);
      return width;
    });

    const maxCellWidth = cellWidths.length > 0 ? Math.max(...cellWidths) : 0;
    const maxWidth = Math.max(headerWidth, maxCellWidth);

    // Add padding
    const finalWidth = maxWidth + 12;

    return Math.min(finalWidth, max);
  } finally {
    document.body.removeChild(container);
  }
};
