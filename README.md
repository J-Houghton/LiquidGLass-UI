# Liquid Glass Filter

A lightweight, physics-based refraction effect for the web. Built with TypeScript and Lit.

## Features

- **Real Physics**: Simulates refraction using Snell's law and variable IOR (Index of Refraction).
- **Web Component**: Drop-in `<liquid-glass-container>` for instant effects.
- **Framework Agnostic**: Works in React, Vue, Svelte, or plain HTML.
- **Tiny Core**: Logic is separated from the UI components.

## Installation

```bash
npm install liquid-glass-filter
```

## Usage

### Option A: The Easy Way (Container Component)
The `liquid-glass-container` wraps your content and applies the effect automatically.
```JavaScript
import { LiquidGlassContainer } from 'liquid-glass-filter';
//import 'liquid-glass-filter'; 
```

```HTML
<liquid-glass-container
  width="300"
  height="200"
  radius="24"
  refractive-index="1.5"
  frost="0.1"
>
</liquid-glass-container>
```

### Option B: Advanced (Filter Only)
If you want to apply the glass effect to your own existing DOM elements using CSS `backdrop-filter`.

```HTML
<liquid-glass-filter filter-id="my-glass" refractive-index="1.4"></liquid-glass-filter>

<div style="backdrop-filter: url(#my-glass);">
  My Custom Element
</div>
```
## Development
This project is a monorepo-style library.
  - `src/core`: Pure TypeScript physics engine. No DOM/Lit dependencies.
  - `src/components`: Lit-based Web Components.
  - `demo/`: The playground UI used for development.

## Commands
```bash
# Start the demo playground
npm run dev

# Build the library (outputs to /dist)
npm run build

# Run tests, not complete/tuned yet!
npm run test
```
---
