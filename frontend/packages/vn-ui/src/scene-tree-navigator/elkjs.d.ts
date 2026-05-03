declare module "elkjs/lib/elk.bundled.js" {
  export type ElkNode = {
    id: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    layoutOptions?: Record<string, string>;
    children?: ElkNode[];
    edges?: ElkExtendedEdge[];
  };

  export type ElkExtendedEdge = {
    id: string;
    sources: string[];
    targets: string[];
  };

  export default class ELK {
    layout(graph: ElkNode): Promise<ElkNode>;
  }
}
