import {
  ASTVisitor,
  FragmentDefinitionNode,
  GraphQLError,
  Kind,
  SelectionNode,
  SelectionSetNode,
  ValidationContext,
} from "graphql";

/**
 * Ограничение ГЛУБИНЫ GraphQL-операции. Копия правила монолита: приложения
 * разные, общего пакета между ними пока нет.
 *
 * В федерации этот щит нужнее, чем в монолите. Supergraph замкнут в цикл
 * `Post.author → User.posts → Post.author → …`, звенья которого живут в РАЗНЫХ
 * subgraph'ах, и на каждом уровне gateway делает новый `_entities`-запрос.
 * Без лимита короткий POST-запрос раскручивается в экспоненциальный ответ.
 *
 * Реализация без внешних зависимостей. Глубина каждого фрагмента считается ОДИН
 * раз и мемоизируется — иначе веерные (fan-out) фрагменты дают экспоненциальный
 * обход, и сам «щит глубины» превращается в вектор DoS на фазе валидации.
 */
export function depthLimit(maxDepth: number) {
  return (context: ValidationContext): ASTVisitor => ({
    Document(documentNode) {
      const fragments: Record<string, FragmentDefinitionNode> = {};
      for (const def of documentNode.definitions) {
        if (def.kind === Kind.FRAGMENT_DEFINITION) {
          fragments[def.name.value] = def;
        }
      }

      // Кэш интринсик-глубины фрагмента + множество «считается сейчас» (защита
      // от циклов: невалидные циклические фрагменты графика отсекает отдельное
      // правило NoFragmentCycles, нам важно лишь не уйти в бесконечную рекурсию).
      const fragmentDepthCache = new Map<string, number>();
      const computing = new Set<string>();

      const selectionSetDepth = (set: SelectionSetNode): number =>
        set.selections.reduce((max, sel) => Math.max(max, selectionDepth(sel)), 0);

      const selectionDepth = (node: SelectionNode): number => {
        switch (node.kind) {
          case Kind.FIELD:
            // Интроспекция/служебные поля (__schema, __typename) не штрафуем.
            if (node.name.value.startsWith("__")) return 0;
            return node.selectionSet ? 1 + selectionSetDepth(node.selectionSet) : 1;
          case Kind.INLINE_FRAGMENT:
            // Инлайн-фрагмент уровень не добавляет — глубину дают поля внутри.
            return selectionSetDepth(node.selectionSet);
          case Kind.FRAGMENT_SPREAD:
            return fragmentDepth(node.name.value);
        }
        return 0;
      };

      const fragmentDepth = (name: string): number => {
        const cached = fragmentDepthCache.get(name);
        if (cached !== undefined) return cached;
        if (computing.has(name)) return 0; // цикл — не зацикливаемся
        const fragment = fragments[name];
        if (!fragment) return 0;
        computing.add(name);
        const depth = selectionSetDepth(fragment.selectionSet);
        computing.delete(name);
        fragmentDepthCache.set(name, depth);
        return depth;
      };

      for (const def of documentNode.definitions) {
        if (def.kind !== Kind.OPERATION_DEFINITION) continue;
        const operationName = def.name?.value ?? "anonymous";
        const depth = selectionSetDepth(def.selectionSet);
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(
              `Query "${operationName}" exceeds the maximum allowed depth of ${maxDepth} (got ${depth})`,
              { nodes: [def], extensions: { code: "GRAPHQL_MAX_DEPTH_EXCEEDED" } },
            ),
          );
        }
      }
    },
  });
}
