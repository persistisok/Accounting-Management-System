export function formObject(form: HTMLFormElement) {
  return Object.fromEntries(
    [...new FormData(form).entries()].filter(([, value]) => typeof value !== 'string' || value.trim() !== ''),
  ) as Record<string, string>;
}
