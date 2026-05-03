# Building a REST API with Express

This tutorial walks through creating a simple REST API for managing a book collection.

## Setting Up the Server

```typescript
import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## Defining the Data Model

```typescript
interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  isbn: string;
}

const books: Book[] = [];
```

## Route Handlers

```javascript
app.get('/api/books', (req, res) => {
  const { author, year } = req.query;

  let filtered = books;
  if (author) {
    filtered = filtered.filter(b => b.author === author);
  }

  res.json({ data: filtered, count: filtered.length });
});
```

## Configuration File

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "bookstore"
  },
  "cache": {
    "ttl": 300
  }
}
```

## Shell Commands

```bash
npm install express
npm run dev
curl http://localhost:3000/api/books
```

## Code Block Without Language

```
This is a plain code block with no language identifier.
It should be rendered as preformatted text.
Multiple lines are preserved exactly as written.
```

## Tilde-Fenced Code Block

~~~python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(fibonacci(10))
~~~

## Indented Code Block

The following block uses four-space indentation instead of fences:

    SELECT id, title, author
    FROM books
    WHERE year > 2020
    ORDER BY title ASC;

## Code Containing Markdown Syntax

```
# This is NOT a heading
- This is NOT a list item
**This is NOT bold**
> This is NOT a blockquote

Everything inside a code block is literal text.
```

## Code Block with Blank Lines

```rust
fn main() {
    let greeting = "Hello, world!";

    println!("{}", greeting);

    // Multiple blank lines above and below are preserved
}
```

## Empty Code Block

```
```

## Adjacent Code Blocks

```css
.container {
  max-width: 1200px;
  margin: 0 auto;
}
```

```html
<div class="container">
  <h1>Book Store</h1>
</div>
```

## Code Block After a List

Common database commands:

- `SELECT` for querying
- `INSERT` for adding records
- `UPDATE` for modifications

```sql
INSERT INTO books (title, author, year)
VALUES ('The Pragmatic Programmer', 'David Thomas', 2019);
```

## Summary

This covers the essential patterns for building a REST API. The code samples above should render as distinct, syntax-highlighted blocks.
