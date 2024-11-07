import PluginsLoader from "@/core/plugins/plugins-loader";



export default async function Page() {

    const pl = new PluginsLoader();
    await pl.Load();

    return (
        <div className="container mx-auto mt-8">
            <h1>Plugins</h1>
            <div className="flex">
                {Array.from(pl.getPlugins()).map(([key, value]) => (
                    <div key={key} className="">
                        <h2>{value.getName()}</h2>
                        <p>{value.getDescription()}</p>
                        <p>{value.getVersion()}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}