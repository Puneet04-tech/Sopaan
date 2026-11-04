import { render } from "preact";
import "./styles.css";
import { App } from "./app";
import { bootstrap } from "./state";

const root = document.getElementById("app");
if (root) render(<App />, root);

void bootstrap();
