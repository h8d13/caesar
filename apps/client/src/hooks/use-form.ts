import { parseTrpcErrors, type TTrpcErrors } from '@caesar/shared';
import { useCallback, useState } from 'react';

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
        const makeInput =
            (key: keyof T, type?: string): TInputHandler =>
            (e) => {
                const newValue = e.target.value;

                makeRaw(key)(type === 'number' ? +newValue : newValue);
            };
        const keys = Object.keys(initialValues) as (keyof T)[];
        const raw = new Map(keys.map((k) => [k, makeRaw(k)]));
        const input = new Map(keys.map((k) => [k, makeInput(k)]));
        const number = new Map(keys.map((k) => [k, makeInput(k, 'number')]));

        return {
            input: (key: keyof T, type?: string) =>
                (type === 'number' ? number : input).get(key) ??
                makeInput(key, type),
            raw: (key: keyof T) => raw.get(key) ?? makeRaw(key)
        };
    });

    const registerInput = useCallback(
        (key: keyof T, type?: string) => {
            const value = String(values[key] ?? '');

            return {
                value,
                onChange: handlers.input(key, type),
                name: key.toString(),
                type,
                error: errors[key as string]
            };
        },
        [values, errors, handlers]
    );

    const registerRaw = useCallback(
        (key: keyof T) => {
            const value = values[key] ?? '';

            return {
                value,
                onChange: handlers.raw(key),
                name: key.toString(),
                error: errors[key as string]
            };
        },
        [values, errors, handlers]
    );

    const setTrpcErrors = useCallback(
        (error: unknown) => {
            setErrors(parseTrpcErrors(error));
        },
        [setErrors]
    );

    const onChange = useCallback(
        <K extends keyof T>(key: K, value: T[K]) => {
            setValues((prev) => ({ ...prev, [key]: value }));
            setErrors((prev) => ({ ...prev, [key]: undefined }));
        },
        [setValues]
    );

    const registerRawNumber = useCallback(
        (key: keyof T) => {
            const value = values[key] as number | undefined;

            return {
                value,
                onChange: handlers.raw(key),
                error: errors[key as string]
            };
        },
        [values, errors, handlers]
    );

    const setErrorsDirectly = useCallback(
        (newErrors: TTrpcErrors) => {
            setErrors(newErrors);
        },
        [setErrors]
    );

    const setError = useCallback(
        (key: keyof T | '_general', errorMessage: string) => {
            setErrors((prev) => ({ ...prev, [key]: errorMessage }));
        },
        [setErrors]
    );

    return {
        values,
        errors,
        setValues,
        setErrors: setErrorsDirectly,
        setTrpcErrors,
        r: registerInput,
        rr: registerRaw,
        rrn: registerRawNumber,
        onChange,
        setError
    };
};

export { useForm };
