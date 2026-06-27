import { graphql } from "../../gql";

// Имена и форма соответствуют мутациям бэкенда: login отдаёт AuthPayload { user, tokens }.
// refreshToken НЕ запрашиваем — бэкенд кладёт его в httpOnly-cookie (в теле он null).
export const LoginDoc = graphql(`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      user {
        id
        username
        role
      }
      tokens {
        accessToken
        expiresIn
      }
    }
  }
`);

export const RegisterDoc = graphql(`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      id
      username
    }
  }
`);

// аргумент не передаём — бэкенд отзывает refresh из cookie и чистит её
export const LogoutDoc = graphql(`
  mutation Logout {
    logout
  }
`);

export const MeDoc = graphql(`
  query Me {
    me {
      id
      username
      displayName
      avatarUrl
      role
    }
  }
`);
