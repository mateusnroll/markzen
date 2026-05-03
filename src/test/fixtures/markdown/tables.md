# API Reference

## Endpoints Overview


| Method | Endpoint       | Description       |
| ------ | -------------- | ----------------- |
| GET    | /api/users     | List all users    |
| POST   | /api/users     | Create a new user |
| GET    | /api/users/:id | Get user by ID    |
| PUT    | /api/users/:id | Update a user     |
| DELETE | /api/users/:id | Delete a user     |


## Column Alignment


| Left-Aligned | Center-Aligned | Right-Aligned |
| :------------ | :--------------: | -------------: |
| Alice        | Engineering    | $120,000      |
| Bob          | Design         | $105,000      |
| Carol        | Marketing      | $98,000       |
| Dave         | Engineering    | $115,000      |


## Inline Formatting in Cells


| Feature             | Status         | Notes                                               |
| ------------------- | -------------- | --------------------------------------------------- |
| **Authentication**  | ✅ Shipped      | Uses `OAuth 2.0` with PKCE                          |
| *Search*            | 🔄 In Progress | See [tracking issue](https://example.com/issues/42) |
| ~~Legacy API~~      | ❌ Removed      | Deprecated since v3.0                               |
| `WebSocket` support | 🔜 Planned     | Target: Q4 release                                  |


## Wide Table


| ID  | Name        | Email                                         | Role                 | Team     | Location      | Start Date |
| --- | ----------- | --------------------------------------------- | -------------------- | -------- | ------------- | ---------- |
| 1   | Alice Chen  | [alice@example.com](mailto:alice@example.com) | Senior Engineer      | Platform | San Francisco | 2021-03-15 |
| 2   | Bob Smith   | [bob@example.com](mailto:bob@example.com)     | Designer             | Product  | New York      | 2022-01-10 |
| 3   | Carol Jones | [carol@example.com](mailto:carol@example.com) | Engineering Manager  | Platform | London        | 2020-07-22 |


## Minimal Table


| A   | B   |
| --- | --- |
| 1   | 2   |


## Table with Empty Cells


| Name  | Phone    | Email                                         |
| ----- | -------- | --------------------------------------------- |
| Alice | 555-0100 | [alice@example.com](mailto:alice@example.com) |
| Bob   |          | [bob@example.com](mailto:bob@example.com)     |
| Carol | 555-0102 |                                               |
| Dave  |          |                                               |


## Table with Escaped Pipes


| Expression    | Result           |
| ------------- | ---------------- |
| `a | b`       | Logical OR       |
| `x || y`      | Short-circuit OR |
| `cmd1 | cmd2` | Shell pipe       |


## Response Codes


| Code | Meaning        | When It Occurs             |
| ---- | -------------- | -------------------------- |
| 200  | OK             | Successful GET or PUT      |
| 201  | Created        | Successful POST            |
| 204  | No Content     | Successful DELETE          |
| 400  | Bad Request    | Validation failure         |
| 401  | Unauthorized   | Missing or invalid token   |
| 404  | Not Found      | Resource doesn't exist     |
| 500  | Internal Error | Unhandled server exception |


