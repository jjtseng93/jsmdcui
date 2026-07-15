# jsmdcui
# hello
- world
- 你好 世界 😅
- Bun JavaScript
- [example](https://example.com)
- [Hello! Click Me](javascript:alert('world'))
- [myfunc 請按我](javascript:myfunc())
- [Print process.argv](javascript:pav())
- [Calculator🧮計算機](javascript:calc())
  * Use cos sin PI directly
## Task list
- [X] task1
- [ ] task2

```js front
export async function myfunc()
{
  let yn=confirm('😃 Are you happy? 你開心嗎？')
  alert(
    yn ? 'Great 太棒了':
         'Sorry to hear that. 很遺憾聽到你這麼說'
  );
}

export async function pav()
{
  let r=await rpc.getArgv();
  alert(r)
}

export async function calc()
{
  let s = prompt('Enter an expression 輸入運算式：')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const result = await new AsyncFunction('rpc',...Object.getOwnPropertyNames(Math),
    `return await (${s});` 
  )(rpc,...Object.getOwnPropertyNames(Math).map(i=>Math[i]))
  alert(
  
    'Result 結果：'+
    result
    
  );
}
```


```js back

export function getArgv()
{
  return process.argv ;
}
```
