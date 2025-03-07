import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { type VariantProps } from "class-variance-authority";
declare const Label: React.ForwardRefExoticComponent<Omit<Omit<LabelPrimitive.LabelProps & React.RefAttributes<HTMLLabelElement>, "ref"> & VariantProps<Component>, "ref"> & React.RefAttributes<HTMLLabelElement>>;
export { Label };
