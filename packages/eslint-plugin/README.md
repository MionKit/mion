# `@mionkit/eslint-plugin`

> ESLint rules for mion projects.

## `installation`

```shell
npm i @mionkit/eslint-plugin -D
```

## add plugin to your ESLint config

Open your ESLint configuration file (e.g., `.eslintrc.json`, `.eslintrc.js`, or `.eslintrc.yaml`).

Add `@mionkit` to the `plugins` array:

```json
{
  "plugins": ["@mionkit"]
}
```

Optionally, you can configure specific rules provided by the plugin under the `rules` section:

```json
{
  "rules": {
    "@mionkit/rule-name": "error"
  }
}
```

## Rules

| Rule Name           | Description                                               | Example                                         |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| no-typeof-runtype   | Prevent calling `typeof` when generating a `RunType`      | `const myObjRunType = runType<typeof myObj>();` |
| requite-params-type | params of routes and hooks should be strongly typed       | `(name: string): string => name`                |
| require-return-type | return types of routes and hooks should be strongly typed | `(name: string): string => name`                |
| require-prop-type   | all properties of classes should be strongly typed        | `class A { prop: string = 'hello'}`             |

## &nbsp;

![mion](../../assets/public/banner-inversex90.png?raw=true)

_[MIT](../../LICENSE) LICENSE_
