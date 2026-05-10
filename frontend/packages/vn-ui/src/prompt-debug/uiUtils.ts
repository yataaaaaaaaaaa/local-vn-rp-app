export function classNames(...names: Array<string | undefined | false>): string {
  return names.filter(Boolean).join(" ");
}
