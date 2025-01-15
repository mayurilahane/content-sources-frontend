import ConditionalTooltip from 'components/ConditionalTooltip/ConditionalTooltip';
import EmptyTableState from 'components/EmptyTableState/EmptyTableState';
import Hide from 'components/Hide/Hide';
import { formatDateUTC } from 'helpers';
import useDeepCompareEffect from 'Hooks/useDeepCompareEffect';
import useRootPath from 'Hooks/useRootPath';
import { isEmpty } from 'lodash';
import { SnapshotDetailTab } from 'Pages/Repositories/ContentListTable/components/SnapshotDetailsModal/SnapshotDetailsModal';
import ChangedArrows from 'Pages/Repositories/ContentListTable/components/SnapshotListModal/components/ChangedArrows';
import React, { useEffect, useState } from 'react';
import { createUseStyles } from 'react-jss';
import { useNavigate } from 'react-router-dom';
import { REPOSITORIES_ROUTE } from 'Routes/constants';
import { SnapshotItem } from 'services/Content/ContentApi';

import { SkeletonTable } from '@patternfly/react-component-groups';
import { Button, Flex, FlexItem, Grid, Icon } from '@patternfly/react-core';
import {
  BaseCellProps,
  Table,
  TableVariant,
  Tbody,
  Td,
  Th,
  Thead,
  ThProps,
  Tr,
} from '@patternfly/react-table';
import { global_BackgroundColor_100 } from '@patternfly/react-tokens';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

const useStyles = createUseStyles({
  mainContainer: {
    backgroundColor: global_BackgroundColor_100.value,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
});

interface Props {
  isFetchingOrLoading: boolean;
  isLoadingOrZeroCount: boolean;
  snapshotList: SnapshotItem[];
  toBeDeletedSnapshots: SnapshotItem[];
  clearSearch: () => void;
  perPage: number;
  sortParams: (columnIndex: number) => ThProps['sort'];
  hasSearch: boolean;
}

export default function TemplateRepositoriesTable({
  isFetchingOrLoading,
  isLoadingOrZeroCount,
  snapshotList,
  toBeDeletedSnapshots,
  clearSearch,
  perPage,
  sortParams,
  hasSearch,
}: Props) {
  const classes = useStyles();
  const rootPath = useRootPath();
  const navigate = useNavigate();
  const [prevLength, setPrev] = useState(perPage || 10);
  const [expandState, setExpandState] = useState({});

  useDeepCompareEffect(() => {
    if (!isEmpty(expandState)) setExpandState({});
  }, [snapshotList]);

  useEffect(() => {
    setPrev(snapshotList.length || 10);
  }, [snapshotList.length]);

  const columnHeaders = [
    { name: 'Name' },
    { name: 'Snapshot Date', width: 20 },
    { name: 'Change', width: 15 },
    { name: 'Packages', width: 15 },
    { name: 'Errata', width: 15 },
  ];

  return (
    <>
      <Hide hide={!isFetchingOrLoading}>
        <Grid className={classes.mainContainer}>
          <SkeletonTable
            rows={prevLength}
            columnsCount={columnHeaders.length}
            variant={TableVariant.compact}
          />
        </Grid>
      </Hide>
      <Hide hide={isFetchingOrLoading}>
        <Table aria-label='repositories table' ouiaId='repositories_table' variant='compact'>
          <Hide hide={isLoadingOrZeroCount}>
            <Thead>
              <Tr>
                {columnHeaders.map(({ name, width }, index) =>
                  name === 'Name' || name === 'Snapshot Date' ? (
                    <Th
                      width={width as BaseCellProps['width']}
                      key={index + name + '_header'}
                      sort={sortParams(index)}
                    >
                      {name}
                    </Th>
                  ) : (
                    <Th width={width as BaseCellProps['width']} key={index + name + '_header'}>
                      {name}
                    </Th>
                  ),
                )}
              </Tr>
            </Thead>
          </Hide>
          {snapshotList.map(
            (
              {
                uuid,
                created_at,
                content_counts,
                added_counts,
                removed_counts,
                repository_name,
                repository_uuid,
              }: SnapshotItem,
              rowIndex,
            ) => (
              <Tbody key={uuid + rowIndex + '-column'}>
                <Tr>
                  <Td>
                    <Flex gap={{ default: 'gapSm' }}>
                      <FlexItem>
                        <Button
                          variant='link'
                          ouiaId='repository_edit_button'
                          isInline
                          onClick={() =>
                            navigate(
                              `${rootPath}/${REPOSITORIES_ROUTE}/edit?repoUUIDS=${repository_uuid}`,
                            )
                          }
                        >
                          {repository_name}
                        </Button>
                      </FlexItem>
                      <Hide hide={!toBeDeletedSnapshots.find((s) => s.uuid == uuid)}>
                        <FlexItem>
                          <ConditionalTooltip
                            show={!!toBeDeletedSnapshots.find((s) => s.uuid == uuid)}
                            position='right'
                            content='The snapshot of this repository used by this template is going to be deleted in the next 14 days.'
                            enableFlip
                          >
                            <Icon status='warning' isInline>
                              <ExclamationTriangleIcon />
                            </Icon>
                          </ConditionalTooltip>
                        </FlexItem>
                      </Hide>
                    </Flex>
                  </Td>
                  <Td>{formatDateUTC(created_at)}</Td>
                  <Td>
                    <ChangedArrows
                      addedCount={added_counts?.['rpm.package'] || 0}
                      removedCount={removed_counts?.['rpm.package'] || 0}
                    />
                  </Td>
                  <Td>
                    <Button
                      variant='link'
                      ouiaId='snapshot_package_count_button'
                      isInline
                      isDisabled={!content_counts?.['rpm.package']}
                      onClick={() =>
                        navigate(
                          `${rootPath}/${REPOSITORIES_ROUTE}/${repository_uuid}/snapshots/${uuid}`,
                        )
                      }
                    >
                      {content_counts?.['rpm.package'] || 0}
                    </Button>
                  </Td>
                  <Td>
                    <Button
                      variant='link'
                      ouiaId='snapshot_advisory_count_button'
                      isInline
                      isDisabled={!content_counts?.['rpm.advisory']}
                      onClick={() =>
                        navigate(
                          `${rootPath}/${REPOSITORIES_ROUTE}/${repository_uuid}/snapshots/${uuid}?tab=${SnapshotDetailTab.ERRATA}`,
                        )
                      }
                    >
                      {content_counts?.['rpm.advisory'] || 0}
                    </Button>
                  </Td>
                </Tr>
              </Tbody>
            ),
          )}
        </Table>
        <Hide hide={!isLoadingOrZeroCount}>
          <EmptyTableState
            notFiltered={!hasSearch}
            clearFilters={clearSearch}
            itemName='repositories'
            notFilteredBody='You may need to add repositories that have snapshots.'
          />
        </Hide>
      </Hide>
    </>
  );
}
