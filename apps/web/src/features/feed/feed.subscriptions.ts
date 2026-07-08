import { graphql } from "../../gql";

// Без аргументов: бэкенд фильтрует postAdded по followingIds из контекста соединения.
// Спред того же фрагмента, что в ленте → новый пост сразу готов к рендеру PostCard.
export const PostAddedSub = graphql(`
  subscription PostAdded {
    postAdded {
      id
      # той же формы, что элемент ленты: content нужен клиентскому поиску
      content
      ...PostCard_post
    }
  }
`);
