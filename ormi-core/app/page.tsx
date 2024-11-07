import PluginsLoader from "@/core/plugins/plugins-loader";
import styles from "./page.module.css";

import TestPluginsList from "./test";
import { PluginsProvider } from "@/core/plugins/plugins-provider";

export default async function Home() {

    const pl = new PluginsLoader();
    await pl.Load();

    // convert p to plain object
    const plugins = pl.convertToPlainObject();

    console.log(plugins);

    return (
        <div className={styles.page}>
            <PluginsProvider pluginsLoader={plugins}>
                <main className={styles.main}>
                    <TestPluginsList />
                </main>
                <footer className={styles.footer}>

                </footer>
            </PluginsProvider>
        </div>
    );
}
