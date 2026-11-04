import { parseTrpcErrors, type TTrpcErrors } from '@caesar/shared';
import { useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TInputHandler = (e: React.ChangeEvent<any>) => void;

const useForm = <T extends Record<string, unknown>>(initialValues: T) => {
    const [values, setValues] = useState<T>(initialValues);
    const [errors, setErrors] = useState<TTrpcErrors>({});

    // Field handlers depend on the key only, never on values: built once so
    // registered fields keep stable props and memoized ones skip renders
    // when another field changes. Keys missing from initialValues fall
    // back to a fresh handler per call.
    const [handlers] = useState(() => {
        const makeRaw = (key: keyof T) => (value: unknown) => {
            setErrors((prev) => ({ ...prev, [key]: undefined }));
            setValues((prev) => ({ ...prev, [key]: value as T[keyof T] }));
        };
        const keys = Object.keys(initialValues) as (keyof T)[];
        const raw = new Map(keys.map((k) => [k, makeRaw(k)]));
        const rawFor = (key: keyof T) => raw.get(key) ?? makeRaw(key);
        const makeInput =
            (key: keyof T, type?: string): TInputHandler =>
            (e) => {
                const newValue = e.target.value;

                rawFor(key)(type === 'number' ? +newValue : newValue);
            };
        const input = new Map(keys.map((k) => [k, makeInput(k)]));
        const number = new Map(keys.map((k) => [k, makeInput(k, 'number')]));

        return {
            input: (key: keyof T, type?: string) =>
                (type === 'number' ? number : input).get(key) ??
                makeInput(key, type),
            raw: rawFor
        };
    });

    // plain functions: the React Compiler memoizes them on their inputs
    const registerInput = (key: keyof T, type?: string) => ({
        value: String(values[key] ?? ''),
        onChange: handlers.input(key, type),
        name: key.toString(),
        type,
        error: errors[key as string]
    });

    const registerRaw = (key: keyof T) => ({
        value: values[key] ?? '',
        onChange: handlers.raw(key),
        name: key.toString(),
        error: errors[key as string]
    });

    const registerRawNumber = (key: keyof T) => ({
        value: values[key] as number | undefined,
        onChange: handlers.raw(key),
        error: errors[key as string]
    });

    const setTrpcErrors = (error: unknown) => setErrors(parseTrpcErrors(error));

    const onChange = <K extends keyof T>(key: K, value: T[K]) =>
        handlers.raw(key)(value);

    const setError = (key: keyof T | '_general', errorMessage: string) =>
        setErrors((prev) => ({ ...prev, [key]: errorMessage }));

    return {
        values,
        setValues,
        setErrors,
        setTrpcErrors,
        r: registerInput,
        rr: registerRaw,
        rrn: registerRawNumber,
        onChange,
        setError
    };
};

export { useForm };
