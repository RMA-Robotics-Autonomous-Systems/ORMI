import PluginsLoader from "@/core/plugins/plugins-loader";
import styles from "./page.module.css";

import { PluginsProvider } from "@/core/plugins/plugins-provider";




export default async function Home() {

    const pl = new PluginsLoader();
    await pl.Load();

    // convert p to plain object
    const plugins = pl.convertToPlainObject();

    return (
        <div className={styles.page}>
            <PluginsProvider pluginsLoader={plugins}>
                <h1>Home</h1>
            </PluginsProvider>
        </div>
    );
}
