import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "init",
		description:
			"Interactive setup wizard — generates pl.config.yaml and installs skills",
	},
	run() {
		console.log("pl init is not yet implemented");
	},
});
