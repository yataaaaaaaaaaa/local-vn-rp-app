import Mustache from "mustache";

type MustacheRenderConfig = {
  escape?: (value: unknown) => string;
};

export function renderPromptTemplate<TData>(template: string, data: TData): string {
  return (Mustache.render as unknown as (
    template: string,
    view: TData,
    partials?: Record<string, string>,
    config?: MustacheRenderConfig
  ) => string)(template, data, {}, { escape: (value: unknown) => String(value ?? "") });
}
