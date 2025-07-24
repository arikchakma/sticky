<h1>
   <picture height="120px">
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/c906b512-dab5-4a63-a8ef-9f56ea941deb">
      <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/fdf91e90-c359-462c-bf4d-06754bbd8a03">
      <img alt="Sticky" height="120px" src="https://github.com/user-attachments/assets/fdf91e90-c359-462c-bf4d-06754bbd8a03">
   </picture>
   <br> Sticky
</h1>

A fast and lightweight notepad for quickly writing down your ideas, notes, tasks, or anything else.

![App Screenshot](https://github.com/user-attachments/assets/a6795eae-0bdb-41f0-9c51-564533d28514)

## Installation

- Download the [relevant version from releases](https://github.com/arikchakma/sticky/releases)
  - For intel chips download x64 DMG e.g. `Sticky_0.1.0_x64.dmg`
  - For Apple chips download aarch64 DMG e.g. `Sticky_0.1.0_aarch64.dmg`
- Double click the downloaded file
- Copy the application into your `Applications` directory
- Run the following command to remove the app from quarantine
  ```
  xattr -rd com.apple.quarantine /Applications/Sticky.app
  ```

## Contributions

Contributions are very welcome! Submit pull requests, create issues, or help improve documentation.

To get a local development environment up and running:

1. Clone the repo: `git clone https://github.com/arikchakma/sticky`
2. Change directory: `cd sticky`
3. Install dependencies: `pnpm install`
4. Start the dev server: `pnpm tauri:dev`

## Acknowledgements

I've taken inspiration from the following projects:

- [Raycast Notes](https://www.raycast.com/core-features/notes)
- [Yaak](https://github.com/mountain-loop/yaak)
- [Tiptap](https://tiptap.dev/)
- [Notemap](https://notemap.com/)

## License

MIT &copy; [Arik Chakma](https://twitter.com/imarikchakma)
