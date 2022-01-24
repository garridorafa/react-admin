import * as React from 'react';
import { BaseSyntheticEvent, useCallback, useEffect, useMemo } from 'react';
import {
    FormProvider,
    useForm,
    UseFormProps,
    FieldValues,
} from 'react-hook-form';

import { useNotify } from '../notification';
import { RaRecord } from '../types';
import { useSaveContext } from '../controller';
import { useRecordContext, OptionalRecordContextProvider } from '../controller';
import getFormInitialValues from './getFormInitialValues';
import { FormGroupsProvider } from './FormGroupsProvider';
import { useInitializeFormWithRecord } from './useInitializeFormWithRecord';
import { useIsFormInvalid } from './useIsFormInvalid';
import { useWarnWhenUnsavedChanges } from './useWarnWhenUnsavedChanges';
import { setSubmissionErrors } from './setSubmissionErrors';

/**
 * Wrapper around react-hook-form's useForm to handle redirection on submit,
 * legacy defaultValue prop, and array inputs.
 *
 * Requires a render function.
 *
 * @example
 *
 * const SimpleForm = props => (
 *    <Form
 *        {...props}
 *        render={formProps => <SimpleFormView {...formProps} />}
 *    />
 * );
 *
 * @typedef {Object} Props the props you can use (other props are injected by Create or Edit)
 * @prop {Object} initialValues
 * @prop {Function} validate
 * @prop {Function} save
 * @prop {boolean} submitOnEnter
 * @prop {string} redirect
 * @prop {boolean} sanitizeEmptyValues
 *
 * @param {Props} props
 */
export const Form = (props: FormProps) => {
    const {
        context,
        criteriaMode = 'firstError',
        defaultValues,
        delayError,
        formRootPathname,
        mode,
        render,
        resolver,
        reValidateMode = 'onChange',
        onSubmit,
        shouldFocusError,
        shouldUnregister,
        shouldUseNativeValidation,
        warnWhenUnsavedChanges,
        validate,
        ...rest
    } = props;
    const record = useRecordContext(props);
    const saveContext = useSaveContext();

    const defaultValuesIncludingRecord = useMemo(
        () => getFormInitialValues(defaultValues, record),
        [JSON.stringify({ defaultValues, record })] // eslint-disable-line
    );

    const form = useForm({
        context,
        criteriaMode,
        defaultValues: defaultValuesIncludingRecord,
        delayError,
        mode,
        reValidateMode,
        resolver:
            resolver ?? validate
                ? getSimpleValidationResolver(validate)
                : undefined,
        shouldFocusError,
        shouldUnregister,
        shouldUseNativeValidation,
    });

    const handleSubmit = useCallback(
        async values => {
            let errors;

            if (onSubmit) {
                errors = await onSubmit(values);
            }
            if (onSubmit == null && saveContext?.save) {
                errors = await saveContext.save(values);
            }
            if (errors != null) {
                setSubmissionErrors(errors, form.setError);
            }
        },
        [form, onSubmit, saveContext]
    );

    return (
        <OptionalRecordContextProvider value={record}>
            <FormProvider {...form}>
                <FormView
                    {...rest}
                    defaultValues={defaultValues}
                    handleSubmit={form.handleSubmit(handleSubmit)}
                    record={record}
                    render={render}
                    warnWhenUnsavedChanges={warnWhenUnsavedChanges}
                    formRootPathname={formRootPathname}
                />
            </FormProvider>
        </OptionalRecordContextProvider>
    );
};
export type ValidateForm = (
    data: FieldValues
) => FieldValues | Promise<FieldValues>;

export type FormProps = FormOwnProps &
    Omit<UseFormProps, 'onSubmit'> & {
        validate?: ValidateForm;
    };

export type FormRenderProps = Omit<
    FormViewProps,
    'children' | 'isValid' | 'render' | 'onSubmit' | 'sanitizeEmptyValues'
>;

export type FormRender = (
    props: FormRenderProps
) => React.ReactElement<any, any>;

export interface FormOwnProps {
    defaultValues?: any;
    formRootPathname?: string;
    record?: Partial<RaRecord>;
    render: FormRender;
    onSubmit?: (data: FieldValues) => any | Promise<any>;
    sanitizeEmptyValues?: boolean;
    saving?: boolean;
    warnWhenUnsavedChanges?: boolean;
}

interface FormViewProps
    extends Omit<FormOwnProps, 'onSubmit' | 'sanitizeEmptyValues'> {
    handleSubmit: (e?: BaseSyntheticEvent) => void;
    warnWhenUnsavedChanges?: boolean;
}

const FormView = (props: FormViewProps) => {
    const {
        defaultValues,
        formRootPathname,
        handleSubmit: formHandleSubmit,
        record,
        render,
        warnWhenUnsavedChanges,
        ...rest
    } = props;
    const isInvalid = useIsFormInvalid();
    const notify = useNotify();

    useEffect(() => {
        if (isInvalid) {
            notify('ra.message.invalid_form', { type: 'warning' });
        }
    }, [isInvalid, notify]);
    useInitializeFormWithRecord(defaultValues, record);
    useWarnWhenUnsavedChanges(warnWhenUnsavedChanges, formRootPathname);

    const handleSubmit = (event: BaseSyntheticEvent) => {
        // Prevent outer forms to receive the event
        event.stopPropagation();
        formHandleSubmit(event);
        return;
    };

    return (
        <FormGroupsProvider>
            {render({ ...rest, handleSubmit })}
        </FormGroupsProvider>
    );
};

const getSimpleValidationResolver = (validate: ValidateForm) => async (
    data: FieldValues
) => {
    const errors = await validate(data);

    if (!errors || Object.getOwnPropertyNames(errors).length === 0) {
        return { values: data, errors: {} };
    }

    return {
        values: {},
        errors: Object.keys(errors).reduce(
            (acc, field) => ({
                ...acc,
                [field]: {
                    type: 'manual',
                    message: errors[field],
                },
            }),
            {} as FieldValues
        ),
    };
};
