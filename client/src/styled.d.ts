import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    colors: {
      primary: string;
      primaryLight: string;
      green: string;
      violet: string;
      grey: string;
      background: string;
      surface: string;
      surfaceHigh: string;
      text: string;
      textMuted: string;
      border: string;
      borderHigh: string;
    };
  }
}
