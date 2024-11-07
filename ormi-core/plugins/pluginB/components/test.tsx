"use client";

const TestComponent = (name: string) => {

    console.log("hello from test component");
    console.log(name);

    return <div>{name}</div>;
}

export default TestComponent;