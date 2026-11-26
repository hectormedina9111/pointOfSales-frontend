/** Divide una línea en campos. Las comillas dobles protegen el separador; "" dentro de comillas es una comilla. */
export function splitCsvFields(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line.charAt(i);
    if (quoted) {
      if (char === '"') {
        if (line.charAt(i + 1) === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}
