#!/usr/bin/env jsmdcui

# Todo List

## Todos

- [ ] canvas support
- [x] push/pop/splice/slice list items
- [x] image by --kitty
- [ ] clean up codebase

## Actions

```text#todo-input
Fly to the moon
```

Enter Todo text above, then choose Add or Remove. Remove deletes the first item whose text matches exactly.

- [Add Todo](javascript:addTodo())
- [Remove Todo](javascript:removeTodo())
- [Show Completed](javascript:showCompleted())
- [Show Pending](javascript:showPending())

## Operation Result

```text#todo-status
No action yet
```

## Filtered Result

```text#todo-result
Select “Show Completed” or “Show Pending” to view matching items
```

```js front
function todoText() {
  return $('#todo-input').val().trim();
}

function showItems(title, checked) {
  const items = $('#todos')
    .slice()
    .filter(item => item.checked === checked);

  const output = items.length
    ? items.map(item => `${item.checked ? '✓' : '○'} ${item.value}`).join('\n')
    : '(No items)';
  const noun = items.length === 1 ? 'item' : 'items';
  $('#todo-result').val(`${title}\n${output}`);
  $('#todo-status').val(`Found ${items.length} ${title.toLowerCase()} ${noun}`);
}

export function addTodo() {
  const value = todoText();
  if (!value) {
    $('#todo-status').val('Add failed: enter Todo text first');
    return;
  }

  const length = $('#todos').push(value);
  $('#todo-input').val('');
  $('#todo-status').val(`Added “${value}”; ${length} Todos total`);
}

export function removeTodo() {
  const value = todoText();
  if (!value) {
    $('#todo-status').val('Remove failed: enter the Todo text to remove');
    return;
  }

  const items = $('#todos').slice();
  const index = items.findIndex(item => item.value === value);
  if (index < 0) {
    $('#todo-status').val(`Remove failed: could not find “${value}”`);
    return;
  }

  const removed = $('#todos').splice(index, 1);
  $('#todo-input').val('');
  $('#todo-status').val(`Removed “${removed[0]}”`);
}

export function showCompleted() {
  showItems('Completed', true);
}

export function showPending() {
  showItems('Pending', false);
}
```
