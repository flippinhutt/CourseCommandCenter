---
course: ITSE 2309
delivery: hybrid
type: sql-lab
status: in-progress
due: 2026-09-17
created: 2026-09-10
---

# Lab 4 - Multi-Table Retrieval

## Lab objective

Retrieve data from two or more tables using JOIN.

## Schema / setup

```sql
SELECT c.CustomerName, o.OrderDate
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID
ORDER BY o.OrderDate DESC;
```

## Notes

- Watch for ambiguous column names when joining.
