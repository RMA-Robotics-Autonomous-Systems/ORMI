import { PluginsLoader } from "ormi-core/plugins"


export default function Page() {

    const pl = new PluginsLoader();

    return (
        <div className="container mx-auto mt-8">
            <div className="flex items-center gap-3">
                <h1>Plugins</h1>
                <small>List of all the plugins that are currently availables</small>
            </div>
            <div className="flex flex-col gap-1 mt-4">
                {Array.from(pl.plugins).map(([key, value]) => (
                    <div key={key} className="border p-4 rounded-md mb-2">
                        <div className="flex justify-between items-center">
                            <div className="flex gap-3 items-center">
                                <h3 className="font-medium">{value.name}</h3>
                                <span className="text-sm text-gray-500">{value.version}</span>
                            </div>
                            {/* <Switch defaultChecked={true} id={"enable-" + value.name} /> */}
                        </div>
                        <p className="mt-2 text-gray-700">{value.description}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}